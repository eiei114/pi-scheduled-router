import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import scheduledRouter from "../extensions/index.ts";
import { CONFIG_FILENAME } from "../lib/paths.ts";
import { STATUS_KEY } from "../lib/selection.ts";

function registerExtension(setModelImpl) {
  const registered = {
    commands: new Map(),
    events: new Map(),
    setModelCalls: [],
    tools: [],
    userMessages: [],
  };
  const pi = {
    on: (event, handler) => registered.events.set(event, handler),
    registerCommand: (name, command) => registered.commands.set(name, command),
    registerTool: (tool) => registered.tools.push(tool),
    sendUserMessage: (message) => registered.userMessages.push(message),
    setModel: async (model) => {
      registered.setModelCalls.push(model);
      return setModelImpl ? setModelImpl(model) : true;
    },
  };
  scheduledRouter(pi);
  return registered;
}

function getScheduledRouterConfigTool(registered = registerExtension()) {
  const tool = registered.tools.find((entry) => entry.name === "scheduled_router_config");
  assert.ok(tool, "scheduled_router_config tool should be registered");
  return tool;
}

async function executeValidate(configYaml) {
  const tool = getScheduledRouterConfigTool();
  return tool.execute("test-call", { action: "validate", configYaml }, undefined, undefined, {});
}

function mockModel(provider, model) {
  return { provider, id: model };
}

function mockCtx(cwd, options = {}) {
  const notifications = [];
  const statuses = new Map();
  const confirmCalls = [];
  const models = options.models ?? {};
  const ctx = {
    cwd,
    hasUI: options.hasUI ?? true,
    modelRegistry: {
      find: (provider, model) => models[`${provider}/${model}`] ?? undefined,
    },
    ui: {
      confirm: async (title, body) => {
        confirmCalls.push({ title, body });
        return options.confirmResult ?? true;
      },
      notify: (msg, level) => notifications.push({ msg, level }),
      setStatus: (key, value) => {
        if (value === undefined) {
          statuses.delete(key);
        } else {
          statuses.set(key, value);
        }
      },
    },
  };
  return { ctx, notifications, statuses, confirmCalls };
}

async function withTempDirs(testFn) {
  const prevAgentDir = process.env.PI_CODING_AGENT_DIR;
  const projectRoot = await mkdtemp(join(tmpdir(), "psr-project-"));
  const agentDir = await mkdtemp(join(tmpdir(), "psr-agent-"));
  process.env.PI_CODING_AGENT_DIR = agentDir;

  try {
    await testFn({ projectRoot, agentDir });
  } finally {
    if (prevAgentDir === undefined) {
      delete process.env.PI_CODING_AGENT_DIR;
    } else {
      process.env.PI_CODING_AGENT_DIR = prevAgentDir;
    }
    await rm(projectRoot, { recursive: true, force: true });
    await rm(agentDir, { recursive: true, force: true });
  }
}

async function writeProjectConfig(projectRoot, yaml = VALID_YAML) {
  const configDir = join(projectRoot, ".pi");
  await mkdir(configDir, { recursive: true });
  const configPath = join(configDir, CONFIG_FILENAME);
  await writeFile(configPath, yaml, "utf8");
  return configPath;
}

const BASE_YAML = `version: 1
default:
  provider: deepseek
  model: deepseek-v4-pro
`;

const VALID_YAML = `${BASE_YAML}slots:
  - from: "00:00"
    to: "24:00"
    provider: cursor
    model: composer-2.5
`;

test("extension registers lifecycle hooks, commands, and the config tool", () => {
  const registered = registerExtension();

  assert.ok(registered.events.has("session_start"));
  assert.ok(registered.events.has("session_shutdown"));
  assert.ok(registered.commands.has("scheduled:status"));
  assert.ok(registered.commands.has("scheduled:configure"));

  const tool = getScheduledRouterConfigTool(registered);
  assert.equal(tool.label, "Scheduled Router Config");
  assert.match(tool.description, /Read, validate, or save/);
});

test("scheduled:status command refreshes and notifies formatted status", async () => {
  await withTempDirs(async ({ projectRoot }) => {
    const configPath = await writeProjectConfig(projectRoot);
    const registered = registerExtension();
    const command = registered.commands.get("scheduled:status");
    const { ctx, notifications } = mockCtx(projectRoot);

    await command.handler([], ctx);

    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].level, "info");
    assert.match(notifications[0].msg, /Matched:\s+slot\[0\] 00:00-24:00 → cursor\/composer-2\.5/);
    assert.match(notifications[0].msg, /Timezone:\s+system-local/);
    assert.ok(notifications[0].msg.includes(configPath));
  });
});

test("scheduled:configure command sends setup prompt when config is missing", async () => {
  await withTempDirs(async ({ projectRoot }) => {
    const registered = registerExtension();
    const command = registered.commands.get("scheduled:configure");
    const { ctx, notifications } = mockCtx(projectRoot);

    await command.handler([], ctx);

    assert.equal(notifications.length, 1);
    assert.match(notifications[0].msg, /config not found/i);
    assert.equal(notifications[0].level, "warning");
    assert.equal(registered.userMessages.length, 1);
    assert.match(registered.userMessages[0], /Start pi-scheduled-router configuration setup/);
    assert.match(registered.userMessages[0], /Current config:\n\(not configured\)$/);
  });
});

test("scheduled_router_config status returns formatted status text", async () => {
  await withTempDirs(async ({ projectRoot }) => {
    await writeProjectConfig(projectRoot);
    const registered = registerExtension();
    const tool = getScheduledRouterConfigTool(registered);
    const { ctx } = mockCtx(projectRoot);

    const result = await tool.execute("test-call", { action: "status" }, undefined, undefined, ctx);

    assert.match(result.content[0].text, /Current time:/);
    assert.match(result.content[0].text, /Matched:\s+slot\[0\] 00:00-24:00 → cursor\/composer-2\.5/);
    assert.match(result.content[0].text, /Config:\s+.*scheduled-router\.yaml/);
  });
});

test("scheduled_router_config read reports an unconfigured project", async () => {
  await withTempDirs(async ({ projectRoot }) => {
    const tool = getScheduledRouterConfigTool();
    const { ctx } = mockCtx(projectRoot);

    const result = await tool.execute("test-call", { action: "read" }, undefined, undefined, ctx);

    assert.equal(result.content[0].text, "");
    assert.equal(result.details.configured, false);
    assert.equal(result.details.configPath, undefined);
  });
});

test("scheduled_router_config read returns normalized YAML for project config", async () => {
  await withTempDirs(async ({ projectRoot }) => {
    const configPath = await writeProjectConfig(projectRoot);
    const tool = getScheduledRouterConfigTool();
    const { ctx } = mockCtx(projectRoot);

    const result = await tool.execute("test-call", { action: "read" }, undefined, undefined, ctx);

    assert.equal(result.details.configured, true);
    assert.equal(result.details.configPath, configPath);
    assert.match(result.content[0].text, /version: 1/);
    assert.match(result.content[0].text, /provider: cursor/);
    assert.match(result.content[0].text, /model: composer-2\.5/);
  });
});

test("scheduled_router_config validate reports invalid configs without throwing", async () => {
  const result = await executeValidate(`${BASE_YAML}slots: []\n`);

  assert.equal(result.details.valid, false);
  assert.match(result.content[0].text, /Config validation failed/);
  assert.match(result.content[0].text, /slots must include at least one entry/);
});

test("scheduled_router_config save writes confirmed config and reselects the model", async () => {
  await withTempDirs(async ({ projectRoot, agentDir }) => {
    const registered = registerExtension();
    const tool = getScheduledRouterConfigTool(registered);
    const { ctx, statuses, confirmCalls } = mockCtx(projectRoot, {
      confirmResult: true,
      models: {
        "cursor/composer-2.5": mockModel("cursor", "composer-2.5"),
      },
    });

    const result = await tool.execute("test-call", { action: "save", configYaml: VALID_YAML }, undefined, undefined, ctx);
    const savedPath = join(agentDir, CONFIG_FILENAME);
    const savedText = await readFile(savedPath, "utf8");

    assert.equal(result.details.saved, true);
    assert.equal(result.details.configPath, savedPath);
    assert.equal(confirmCalls.length, 1);
    assert.equal(confirmCalls[0].title, "Save scheduled router config?");
    assert.match(confirmCalls[0].body, /Default:\s+deepseek\/deepseek-v4-pro/);
    assert.match(savedText, /provider: cursor/);
    assert.equal(registered.setModelCalls.length, 1);
    assert.equal(registered.setModelCalls[0].provider, "cursor");
    assert.equal(statuses.get(STATUS_KEY), "cursor/composer-2.5");
    assert.match(result.content[0].text, /Config saved and model reselected/);
  });
});

test("scheduled_router_config save does not write when confirmation UI is unavailable", async () => {
  await withTempDirs(async ({ projectRoot, agentDir }) => {
    const registered = registerExtension();
    const tool = getScheduledRouterConfigTool(registered);
    const { ctx, confirmCalls } = mockCtx(projectRoot, { hasUI: false });

    const result = await tool.execute("test-call", { action: "save", configYaml: VALID_YAML }, undefined, undefined, ctx);

    assert.equal(result.details.saved, false);
    assert.match(result.content[0].text, /confirmation UI is unavailable/);
    assert.equal(confirmCalls.length, 0);
    assert.equal(registered.setModelCalls.length, 0);
    assert.equal(existsSync(join(agentDir, CONFIG_FILENAME)), false);
  });
});

test("scheduled_router_config validate reports fully-overlapping slot warnings without rejecting", async () => {
  const result = await executeValidate(`${BASE_YAML}slots:
  - from: "09:00"
    to: "17:00"
    provider: a
    model: a
  - from: "13:00"
    to: "15:00"
    provider: b
    model: b
`);

  assert.equal(result.details.valid, true);
  assert.equal(result.details.warnings.length, 1);
  assert.equal(result.details.warnings[0].type, "masked-slot");
  assert.match(result.content[0].text, /Config is valid/);
  assert.match(result.content[0].text, /slot\[1\] 13:00-15:00 is fully masked/);
});

test("scheduled_router_config validate reports duplicate range warnings without rejecting", async () => {
  const result = await executeValidate(`${BASE_YAML}slots:
  - from: "09:00"
    to: "17:00"
    provider: a
    model: a
  - from: "09:00"
    to: "17:00"
    provider: b
    model: b
`);

  assert.equal(result.details.valid, true);
  assert.equal(result.details.warnings.length, 1);
  assert.match(result.content[0].text, /slot\[1\] 09:00-17:00 is fully masked by earlier slot/);
});

test("scheduled_router_config validate reports no warnings for clean multi-slot configs", async () => {
  const result = await executeValidate(`${BASE_YAML}slots:
  - from: "09:00"
    to: "12:00"
    provider: a
    model: a
  - from: "13:00"
    to: "17:00"
    provider: b
    model: b
  - from: "20:00"
    to: "02:00"
    provider: c
    model: c
`);

  assert.equal(result.details.valid, true);
  assert.deepEqual(result.details.warnings, []);
  assert.match(result.content[0].text, /No config warnings/);
});
