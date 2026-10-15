import assert from "node:assert/strict";
import test from "node:test";
import {
  behaviorAssertions,
  parseJsonLines,
  VERIFICATION_CONTRACT,
} from "../scripts/pi-sdk-smoke-contract.mjs";

const model = { provider: "smoke-provider", id: "scheduled-model" };
const registration = {
  type: "response",
  id: "load-commands",
  command: "get_commands",
  success: true,
  data: { commands: [{ name: "scheduled:status", source: "extension" }] },
};
const state = {
  type: "response",
  id: "happy-state",
  command: "get_state",
  success: true,
  data: { model },
};
const prompt = {
  type: "response",
  id: "happy-status",
  command: "prompt",
  success: true,
  data: { disposition: "handled" },
};
const notification = {
  type: "extension_ui_request",
  method: "notify",
  notifyType: "info",
  message: "Matched:      slot[0] 00:00-24:00 → smoke-provider/scheduled-model",
};
const selectedStatus = {
  type: "extension_ui_request",
  method: "setStatus",
  statusKey: "scheduled-router",
  statusText: "smoke-provider/scheduled-model",
};
const clearedStatus = {
  type: "extension_ui_request",
  method: "setStatus",
  statusKey: "scheduled-router",
};

test("behavior contract and LF/CRLF JSONL parsing", () => {
  assert.equal(VERIFICATION_CONTRACT, "pi-sdk-behavior-v2");
  assert.deepEqual(parseJsonLines(`not-json\r\n${JSON.stringify(prompt)}\n\n`), [prompt]);
});

test("extension load requires the actual extension command registration", () => {
  const good = behaviorAssertions("extension_load", {
    responses: [registration],
    fullOutput: "",
    exit_code: 0,
  });
  assert.deepEqual(good.map((item) => item.id), ["extension_registered"]);
  assert.equal(good[0].passed, true);

  for (const commands of [[], [{ name: "scheduled:status", source: "prompt" }], [{ name: "other", source: "extension" }]]) {
    const result = behaviorAssertions("extension_load", {
      responses: [{ ...registration, data: { commands } }],
      fullOutput: "",
      exit_code: 0,
    });
    assert.equal(result[0].passed, false);
  }
});

test("happy path requires selected Pi model and handled route response", () => {
  const responses = [state, prompt, notification, selectedStatus];
  const good = behaviorAssertions("happy_path", {
    responses,
    fullOutput: "",
    exit_code: 0,
    expectedModel: model,
  });
  assert.equal(good[0].passed, true);

  const invalidResponses = [
    responses.filter((row) => row !== state),
    responses.filter((row) => row !== prompt),
    responses.filter((row) => row !== notification),
    responses.filter((row) => row !== selectedStatus),
    responses.map((row) => row === prompt ? { ...prompt, success: false } : row),
    responses.map((row) => row === state ? { ...state, data: { model: { ...model, id: "wrong-model" } } } : row),
  ];
  for (const invalid of invalidResponses) {
    assert.equal(behaviorAssertions("happy_path", {
      responses: invalid,
      fullOutput: "",
      exit_code: 0,
      expectedModel: model,
    })[0].passed, false);
  }
});

test("error path requires the handled invalid-config warning and clean host result", () => {
  const warning = {
    type: "extension_ui_request",
    method: "notify",
    notifyType: "warning",
    message: "Scheduled router: invalid config: Unsupported config version 2. Expected 1.",
  };
  assert.equal(behaviorAssertions("error_path", {
    responses: [warning],
    fullOutput: "",
    exit_code: 0,
  })[0].passed, true);

  for (const responses of [[], [{ ...warning, notifyType: "error" }]]) {
    assert.equal(behaviorAssertions("error_path", {
      responses,
      fullOutput: "",
      exit_code: 0,
    })[0].passed, false);
  }
  assert.equal(behaviorAssertions("error_path", {
    responses: [warning],
    fullOutput: "UnhandledPromiseRejection",
    exit_code: 0,
  })[0].passed, false);
});

test("reload requires second-process registration, real feature response, and clean exit", () => {
  const responses = [
    { ...registration, id: "reload-commands" },
    { ...state, id: "reload-state" },
    { ...prompt, id: "reload-status" },
    notification,
    selectedStatus,
    clearedStatus,
  ];
  const good = behaviorAssertions("reload_cleanup", {
    responses,
    fullOutput: "",
    exit_code: { first: 0, second: 0 },
    expectedModel: model,
  });
  assert.deepEqual(good.map((item) => item.id), [
    "reloaded_extension_registered",
    "reloaded_feature_response",
    "clean_shutdown",
  ]);
  assert.ok(good.every((item) => item.passed));

  const incompleteResponses = [
    responses.filter((row) => row.id !== "reload-commands"),
    responses.filter((row) => row.id !== "reload-state"),
    responses.filter((row) => row.id !== "reload-status"),
    responses.filter((row) => row !== notification),
    responses.filter((row) => row !== selectedStatus),
    responses.filter((row) => row !== clearedStatus),
  ];
  for (const incomplete of incompleteResponses) {
    assert.ok(behaviorAssertions("reload_cleanup", {
      responses: incomplete,
      fullOutput: "",
      exit_code: { first: 0, second: 0 },
      expectedModel: model,
    }).some((item) => !item.passed));
  }
  for (const [fullOutput, exit_code] of [
    ["shutdown error", { first: 0, second: 0 }],
    ["UnhandledPromiseRejection", { first: 0, second: 0 }],
    ["", { first: 0, second: null }],
  ]) {
    assert.equal(behaviorAssertions("reload_cleanup", {
      responses,
      fullOutput,
      exit_code,
      expectedModel: model,
    })[2].passed, false);
  }
});

test("native shell boundary requires exact pinned version and clean stderr", () => {
  const good = behaviorAssertions("host_shell", {
    responses: [],
    fullOutput: { stdout: "1.2.0\r\n", stderr: "" },
    exit_code: 0,
    expectedVersion: "1.2.0",
  });
  assert.equal(good[0].passed, true);

  for (const stdout of ["", "11.2.0", "1.2.0 with error", "1.1.0"]) {
    assert.equal(behaviorAssertions("host_shell", {
      responses: [],
      fullOutput: { stdout, stderr: "" },
      exit_code: 0,
      expectedVersion: "1.2.0",
    })[0].passed, false);
  }
  assert.equal(behaviorAssertions("host_shell", {
    responses: [],
    fullOutput: { stdout: "1.2.0\n", stderr: "warning" },
    exit_code: 0,
    expectedVersion: "1.2.0",
  })[0].passed, false);
});
