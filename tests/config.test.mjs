import assert from "node:assert/strict";
import test from "node:test";
import { validateConfig } from "../lib/config.ts";

const VALID_CONFIG = {
  version: 1,
  default: { provider: "deepseek", model: "deepseek-v4-pro" },
  slots: [
    { from: "10:00", to: "15:00", provider: "cursor", model: "composer-2.5" },
    { from: "15:00", to: "24:00", provider: "openai-codex", model: "gpt-5.4" },
  ],
};

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
