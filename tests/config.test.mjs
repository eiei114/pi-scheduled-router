import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadConfig, resolveConfigPath, validateConfig } from "../lib/config.ts";

const VALID_CONFIG = {
  version: 1,
  default: { provider: "deepseek", model: "deepseek-v4-pro" },
  slots: [
    { from: "10:00", to: "15:00", provider: "cursor", model: "composer-2.5" },
    { from: "15:00", to: "24:00", provider: "openai-codex", model: "gpt-5.4" },
  ],
};

const VALID_YAML = `version: 1
default:
  provider: deepseek
  model: deepseek-v4-pro
slots:
  - from: "10:00"
    to: "15:00"
    provider: cursor
    model: composer-2.5
  - from: "15:00"
    to: "24:00"
    provider: openai-codex
    model: gpt-5.4
`;

function mockCtx(cwd) {
  const notifications = [];
  const ctx = {
    cwd,
    ui: {
      notify: (msg, level) => notifications.push({ msg, level }),
    },
  };
  return { ctx, notifications };
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

test("validateConfig passes a valid config", () => {
  const result = validateConfig(VALID_CONFIG);
  assert.equal(result.version, 1);
  assert.equal(result.default.provider, "deepseek");
  assert.equal(result.slots.length, 2);
});

test("validateConfig rejects missing version", () => {
  assert.throws(() => validateConfig({ ...VALID_CONFIG, version: undefined }));
});

test("validateConfig rejects wrong version", () => {
  assert.throws(() => validateConfig({ ...VALID_CONFIG, version: 2 }));
});

test("validateConfig rejects missing default", () => {
  const { default: _, ...noDefault } = VALID_CONFIG;
  assert.throws(() => validateConfig(noDefault));
});

test("validateConfig rejects empty provider in default", () => {
  assert.throws(() =>
    validateConfig({ ...VALID_CONFIG, default: { provider: "", model: "foo" } }),
  );
});

test("validateConfig rejects empty model in default", () => {
  assert.throws(() =>
    validateConfig({ ...VALID_CONFIG, default: { provider: "foo", model: "" } }),
  );
});

test("validateConfig rejects non-array slots", () => {
  assert.throws(() => validateConfig({ ...VALID_CONFIG, slots: {} }));
});

test("validateConfig rejects empty slots", () => {
  assert.throws(() => validateConfig({ ...VALID_CONFIG, slots: [] }));
});

test("validateConfig rejects slot with missing from", () => {
  assert.throws(() =>
    validateConfig({
      ...VALID_CONFIG,
      slots: [{ to: "15:00", provider: "cursor", model: "composer-2.5" }],
    }),
  );
});

test("validateConfig rejects slot with invalid HH:MM", () => {
  assert.throws(() =>
    validateConfig({
      ...VALID_CONFIG,
      slots: [{ from: "25:00", to: "15:00", provider: "x", model: "y" }],
    }),
  );
});

test("validateConfig accepts valid timezone", () => {
  const result = validateConfig({ ...VALID_CONFIG, timezone: "Asia/Tokyo" });
  assert.equal(result.timezone, "Asia/Tokyo");
});

test("validateConfig rejects invalid timezone", () => {
  assert.throws(() => validateConfig({ ...VALID_CONFIG, timezone: "Fake/Zone" }));
});

test("validateConfig accepts empty timezone", () => {
  const result = validateConfig({ ...VALID_CONFIG, timezone: undefined });
  assert.equal(result.timezone, undefined);
});

test("resolveConfigPath prefers project .pi over agent dir", async () => {
  await withTempDirs(async ({ projectRoot, agentDir }) => {
    const projectConfigDir = join(projectRoot, ".pi");
    await mkdir(projectConfigDir, { recursive: true });
    await writeFile(join(projectConfigDir, "scheduled-router.yaml"), VALID_YAML);
    await writeFile(join(agentDir, "scheduled-router.yaml"), "version: 2\n");

    const { ctx } = mockCtx(projectRoot);
    const path = resolveConfigPath(ctx);
    assert.equal(path, join(projectConfigDir, "scheduled-router.yaml"));
  });
});

test("resolveConfigPath falls back to agent dir when project config is absent", async () => {
  await withTempDirs(async ({ projectRoot, agentDir }) => {
    await writeFile(join(agentDir, "scheduled-router.yaml"), VALID_YAML);

    const { ctx } = mockCtx(projectRoot);
    const path = resolveConfigPath(ctx);
    assert.equal(path, join(agentDir, "scheduled-router.yaml"));
  });
});

test("resolveConfigPath returns undefined when no config file exists", async () => {
  await withTempDirs(async ({ projectRoot }) => {
    const { ctx } = mockCtx(projectRoot);
    assert.equal(resolveConfigPath(ctx), undefined);
  });
});

test("loadConfig loads and validates a valid config file", async () => {
  await withTempDirs(async ({ projectRoot }) => {
    const projectConfigDir = join(projectRoot, ".pi");
    await mkdir(projectConfigDir, { recursive: true });
    await writeFile(join(projectConfigDir, "scheduled-router.yaml"), VALID_YAML);

    const { ctx, notifications } = mockCtx(projectRoot);
    const result = loadConfig(ctx);
    assert.equal(result?.version, 1);
    assert.equal(result?.default.provider, "deepseek");
    assert.equal(notifications.length, 0);
  });
});

test("loadConfig notifies and returns undefined when config is missing", async () => {
  await withTempDirs(async ({ projectRoot }) => {
    const { ctx, notifications } = mockCtx(projectRoot);
    const result = loadConfig(ctx);
    assert.equal(result, undefined);
    assert.equal(notifications.length, 1);
    assert.match(notifications[0].msg, /config not found/i);
    assert.equal(notifications[0].level, "warning");
  });
});

test("loadConfig notifies and returns undefined on YAML parse error", async () => {
  await withTempDirs(async ({ projectRoot }) => {
    const projectConfigDir = join(projectRoot, ".pi");
    await mkdir(projectConfigDir, { recursive: true });
    await writeFile(join(projectConfigDir, "scheduled-router.yaml"), ":\n  bad: yaml: [");

    const { ctx, notifications } = mockCtx(projectRoot);
    const result = loadConfig(ctx);
    assert.equal(result, undefined);
    assert.equal(notifications.length, 1);
    assert.match(notifications[0].msg, /failed to parse YAML/i);
    assert.equal(notifications[0].level, "warning");
  });
});

test("loadConfig notifies and returns undefined on schema violation", async () => {
  await withTempDirs(async ({ projectRoot }) => {
    const projectConfigDir = join(projectRoot, ".pi");
    await mkdir(projectConfigDir, { recursive: true });
    await writeFile(
      join(projectConfigDir, "scheduled-router.yaml"),
      "version: 2\ndefault:\n  provider: x\n  model: y\nslots: []\n",
    );

    const { ctx, notifications } = mockCtx(projectRoot);
    const result = loadConfig(ctx);
    assert.equal(result, undefined);
    assert.equal(notifications.length, 1);
    assert.match(notifications[0].msg, /invalid config/i);
    assert.equal(notifications[0].level, "warning");
  });
});
