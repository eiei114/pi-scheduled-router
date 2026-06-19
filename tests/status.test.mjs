import assert from "node:assert/strict";
import test from "node:test";
import { formatCurrentDateTime } from "../lib/status-format.ts";
import { formatScheduledRouterStatus } from "../lib/status.ts";

const SAMPLE_CONFIG = {
  version: 1,
  timezone: "Asia/Tokyo",
  default: { provider: "deepseek", model: "deepseek-v4-pro" },
  slots: [{ from: "10:00", to: "15:00", provider: "cursor", model: "composer-2.5" }],
};

test("formatCurrentDateTime includes date, time, and timezone suffix", () => {
  const text = formatCurrentDateTime("Asia/Tokyo", new Date("2026-06-07T05:23:00.000Z"));
  assert.match(text, /^2026-06-07 14:23 /);
  assert.match(text, /(JST|GMT\+9)$/);
});

test("formatScheduledRouterStatus shows matched slot details", () => {
  const text = formatScheduledRouterStatus({
    config: SAMPLE_CONFIG,
    currentMatch: {
      provider: "cursor",
      model: "composer-2.5",
      matched: true,
      slotIndex: 0,
    },
    configPath: "C:/Users/Keisu/.pi/scheduled-router.yaml",
    now: new Date("2026-06-07T05:23:00.000Z"),
  });

  assert.match(text, /Current time: 2026-06-07 14:23/);
  assert.match(text, /Timezone:     Asia\/Tokyo/);
  assert.match(text, /Matched:      slot\[0\] 10:00-15:00 → cursor\/composer-2.5/);
  assert.match(text, /Config:       C:\/Users\/Keisu\/.pi\/scheduled-router.yaml/);
});

test("formatScheduledRouterStatus shows default when no slot matches", () => {
  const text = formatScheduledRouterStatus({
    config: SAMPLE_CONFIG,
    currentMatch: {
      provider: "deepseek",
      model: "deepseek-v4-pro",
      matched: false,
    },
    configPath: "/tmp/scheduled-router.yaml",
    now: new Date("2026-06-07T05:23:00.000Z"),
  });

  assert.match(text, /No slot matched, using default: deepseek\/deepseek-v4-pro/);
});

test("formatScheduledRouterStatus reports unloaded config", () => {
  const text = formatScheduledRouterStatus({ configPath: "(not configured)" });
  assert.match(text, /not evaluated \(config not loaded\)/);
});
