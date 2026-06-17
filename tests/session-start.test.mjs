import assert from "node:assert/strict";
import test from "node:test";
import {
  clearScheduledRouterStatus,
  selectAndSetModel,
  STATUS_KEY,
} from "../lib/selection.ts";

const CONFIG = {
  version: 1,
  default: { provider: "deepseek", model: "deepseek-v4-pro" },
  slots: [
    { from: "10:00", to: "15:00", provider: "cursor", model: "composer-2.5" },
    { from: "15:00", to: "24:00", provider: "openai-codex", model: "gpt-5.4" },
  ],
};

function at(hours, minutes) {
  return new Date(2026, 0, 1, hours, minutes, 0, 0);
}

function mockModel(provider, model) {
  return { provider, id: model };
}

function mockCtx(models = {}) {
  const notifications = [];
  const statuses = new Map();

  const ctx = {
    modelRegistry: {
      find: (provider, model) => models[`${provider}/${model}`] ?? undefined,
    },
    ui: {
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

  return { ctx, notifications, statuses };
}

function mockPi(setModelImpl) {
  const calls = [];
  return {
    calls,
    pi: {
      setModel: async (model) => {
        calls.push(model);
        if (setModelImpl) return setModelImpl(model);
        return true;
      },
    },
  };
}

test("selectAndSetModel sets matched slot model on happy path", async () => {
  const models = {
    "cursor/composer-2.5": mockModel("cursor", "composer-2.5"),
  };
  const { ctx, notifications, statuses } = mockCtx(models);
  const { pi, calls } = mockPi();

  const success = await selectAndSetModel(pi, ctx, CONFIG, at(11, 0));

  assert.equal(success, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].provider, "cursor");
  assert.equal(statuses.get(STATUS_KEY), "cursor/composer-2.5");
  assert.equal(notifications.length, 0);
});

test("selectAndSetModel sets default model when no slot matches", async () => {
  const models = {
    "deepseek/deepseek-v4-pro": mockModel("deepseek", "deepseek-v4-pro"),
  };
  const { ctx, notifications, statuses } = mockCtx(models);
  const { pi, calls } = mockPi();

  const success = await selectAndSetModel(pi, ctx, CONFIG, at(9, 0));

  assert.equal(success, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].provider, "deepseek");
  assert.equal(statuses.get(STATUS_KEY), "deepseek/deepseek-v4-pro");
  assert.equal(notifications.length, 0);
});

test("selectAndSetModel falls back to default when matched slot model is missing", async () => {
  const models = {
    "deepseek/deepseek-v4-pro": mockModel("deepseek", "deepseek-v4-pro"),
  };
  const { ctx, notifications, statuses } = mockCtx(models);
  const { pi, calls } = mockPi();

  const success = await selectAndSetModel(pi, ctx, CONFIG, at(11, 0));

  assert.equal(success, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].provider, "deepseek");
  assert.equal(statuses.get(STATUS_KEY), "deepseek/deepseek-v4-pro");
  assert.equal(notifications.length, 1);
  assert.match(notifications[0].msg, /model cursor\/composer-2.5 not found, falling back to default/);
  assert.equal(notifications[0].level, "warning");
});

test("selectAndSetModel notifies and skips when matched slot and default models are missing", async () => {
  const { ctx, notifications, statuses } = mockCtx({});
  const { pi, calls } = mockPi();

  const success = await selectAndSetModel(pi, ctx, CONFIG, at(11, 0));

  assert.equal(success, false);
  assert.equal(calls.length, 0);
  assert.equal(statuses.has(STATUS_KEY), false);
  assert.equal(notifications.length, 2);
  assert.match(notifications[0].msg, /model cursor\/composer-2.5 not found, falling back to default/);
  assert.match(notifications[1].msg, /default model deepseek\/deepseek-v4-pro also not found/);
});

test("selectAndSetModel notifies and skips when default match model is missing", async () => {
  const { ctx, notifications, statuses } = mockCtx({});
  const { pi, calls } = mockPi();

  const success = await selectAndSetModel(pi, ctx, CONFIG, at(9, 0));

  assert.equal(success, false);
  assert.equal(calls.length, 0);
  assert.equal(statuses.has(STATUS_KEY), false);
  assert.equal(notifications.length, 1);
  assert.match(notifications[0].msg, /default model deepseek\/deepseek-v4-pro not found/);
  assert.equal(notifications[0].level, "warning");
});

test("selectAndSetModel does not set status when setModel returns false", async () => {
  const models = {
    "cursor/composer-2.5": mockModel("cursor", "composer-2.5"),
  };
  const { ctx, statuses } = mockCtx(models);
  const { pi } = mockPi(async () => false);

  const success = await selectAndSetModel(pi, ctx, CONFIG, at(11, 0));

  assert.equal(success, false);
  assert.equal(statuses.has(STATUS_KEY), false);
});

test("clearScheduledRouterStatus removes scheduled-router status entry", () => {
  const { ctx, statuses } = mockCtx({});
  ctx.ui.setStatus(STATUS_KEY, "cursor/composer-2.5");
  assert.equal(statuses.get(STATUS_KEY), "cursor/composer-2.5");

  clearScheduledRouterStatus(ctx);

  assert.equal(statuses.has(STATUS_KEY), false);
});
