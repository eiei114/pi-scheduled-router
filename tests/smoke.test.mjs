import assert from "node:assert/strict";
import test from "node:test";
import { validateConfig } from "../lib/config.ts";
import { matchSlot } from "../lib/matcher.ts";

const VALID_CONFIG = {
  version: 1,
  default: { provider: "deepseek", model: "deepseek-v4-pro" },
  slots: [{ from: "09:00", to: "17:00", provider: "openai-codex", model: "gpt-5.4" }],
};

test("scheduled-router: config validates and matcher runs", () => {
  const validated = validateConfig(VALID_CONFIG);
  assert.equal(validated.version, 1);

  const match = matchSlot(validated, new Date(2026, 0, 1, 12, 0));
  assert.equal(match?.provider, "openai-codex");
  assert.equal(match?.model, "gpt-5.4");
  assert.equal(match?.matched, true);
});
