import assert from "node:assert/strict";
import test from "node:test";
import scheduledRouter from "../extensions/index.ts";

function registerExtension() {
  const registered = { tools: [] };
  const pi = {
    on: () => {},
    registerCommand: () => {},
    registerTool: (tool) => registered.tools.push(tool),
    sendUserMessage: () => {},
  };
  scheduledRouter(pi);
  return registered;
}

function getScheduledRouterConfigTool() {
  const { tools } = registerExtension();
  const tool = tools.find((entry) => entry.name === "scheduled_router_config");
  assert.ok(tool, "scheduled_router_config tool should be registered");
  return tool;
}

async function executeValidate(configYaml) {
  const tool = getScheduledRouterConfigTool();
  return tool.execute("test-call", { action: "validate", configYaml }, undefined, undefined, {});
}

const BASE_YAML = `version: 1
default:
  provider: deepseek
  model: deepseek-v4-pro
`;

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
