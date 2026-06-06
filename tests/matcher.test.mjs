import assert from "node:assert/strict";
import test from "node:test";
import { matchSlot, getNowInTimezone } from "../lib/matcher.ts";

const CONFIG = {
  version: 1,
  default: { provider: "deepseek", model: "deepseek-v4-pro" },
  slots: [
    { from: "10:00", to: "15:00", provider: "cursor", model: "composer-2.5" },
    { from: "15:00", to: "24:00", provider: "openai-codex", model: "gpt-5.4" },
  ],
};

const DAY_SPANNING_CONFIG = {
  version: 1,
  default: { provider: "deepseek", model: "deepseek-v4-pro" },
  slots: [
    { from: "22:00", to: "02:00", provider: "cursor", model: "composer-2.5" },
  ],
};

function at(hours, minutes) {
  return new Date(2026, 0, 1, hours, minutes, 0, 0);
}

// ── Normal range matching ──

test("matchSlot matches normal slot when time is within range", () => {
  const result = matchSlot(CONFIG, at(11, 0));
  assert.equal(result?.provider, "cursor");
  assert.equal(result?.model, "composer-2.5");
  assert.equal(result?.matched, true);
  assert.equal(result?.slotIndex, 0);
});

test("matchSlot matches second slot when time falls into it", () => {
  const result = matchSlot(CONFIG, at(17, 30));
  assert.equal(result?.provider, "openai-codex");
  assert.equal(result?.model, "gpt-5.4");
  assert.equal(result?.matched, true);
  assert.equal(result?.slotIndex, 1);
});

test("matchSlot returns default for gap between slots", () => {
  const result = matchSlot(CONFIG, at(9, 0));
  assert.equal(result?.provider, "deepseek");
  assert.equal(result?.model, "deepseek-v4-pro");
  assert.equal(result?.matched, false);
});

test("matchSlot returns default for time before all slots", () => {
  const result = matchSlot(CONFIG, at(6, 0));
  assert.equal(result?.matched, false);
  assert.equal(result?.provider, "deepseek");
});

test("matchSlot first-match wins on overlapping slots", () => {
  const overlapping = {
    ...CONFIG,
    slots: [
      { from: "10:00", to: "20:00", provider: "first", model: "a" },
      { from: "10:00", to: "20:00", provider: "second", model: "b" },
    ],
  };
  const result = matchSlot(overlapping, at(12, 0));
  assert.equal(result?.provider, "first");
  assert.equal(result?.slotIndex, 0);
});

test("matchSlot boundary: from is inclusive", () => {
  const result = matchSlot(CONFIG, at(10, 0));
  assert.equal(result?.matched, true);
  assert.equal(result?.slotIndex, 0);
});

test("matchSlot boundary: to is exclusive", () => {
  const result = matchSlot(CONFIG, at(15, 0));
  assert.equal(result?.slotIndex, 1); // matches slot[1] "15:00"-"24:00"
});

// ── Day-spanning ──

test("day-spanning matches late night (23:00)", () => {
  const result = matchSlot(DAY_SPANNING_CONFIG, at(23, 0));
  assert.equal(result?.matched, true);
  assert.equal(result?.provider, "cursor");
});

test("day-spanning matches early morning (01:00)", () => {
  const result = matchSlot(DAY_SPANNING_CONFIG, at(1, 0));
  assert.equal(result?.matched, true);
  assert.equal(result?.provider, "cursor");
});

test("day-spanning does not match middle of day (12:00)", () => {
  const result = matchSlot(DAY_SPANNING_CONFIG, at(12, 0));
  assert.equal(result?.matched, false);
  assert.equal(result?.provider, "deepseek"); // default
});

test("day-spanning boundary: from is inclusive (22:00)", () => {
  const result = matchSlot(DAY_SPANNING_CONFIG, at(22, 0));
  assert.equal(result?.matched, true);
});

test("day-spanning boundary: to is exclusive (02:00)", () => {
  const result = matchSlot(DAY_SPANNING_CONFIG, at(2, 0));
  assert.equal(result?.matched, false);
  assert.equal(result?.provider, "deepseek");
});

test("day-spanning boundary: 00:00 is inside range", () => {
  const result = matchSlot(DAY_SPANNING_CONFIG, at(0, 0));
  assert.equal(result?.matched, true);
});

// ── Edge cases ──

test("matchSlot returns undefined for undefined config", () => {
  const result = matchSlot(undefined, at(12, 0));
  assert.equal(result, undefined);
});

test("matchSlot last slot end at 24:00 works", () => {
  const config = {
    version: 1,
    default: { provider: "deepseek", model: "deepseek-v4-pro" },
    slots: [{ from: "00:00", to: "24:00", provider: "always", model: "on" }],
  };
  const result = matchSlot(config, at(23, 59));
  assert.equal(result?.provider, "always");
  assert.equal(result?.matched, true);
});

// ── getNowInTimezone ──

test("getNowInTimezone returns a valid time for system local", () => {
  const result = getNowInTimezone();
  assert.ok(result.hours >= 0 && result.hours <= 23);
  assert.ok(result.minutes >= 0 && result.minutes <= 59);
});

test("getNowInTimezone returns a valid time for explicit timezone", () => {
  const result = getNowInTimezone("Asia/Tokyo");
  assert.ok(result.hours >= 0 && result.hours <= 23);
  assert.ok(result.minutes >= 0 && result.minutes <= 59);
});
