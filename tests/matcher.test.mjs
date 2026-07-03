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

test("day-spanning matches late night (23:30)", () => {
  const result = matchSlot(DAY_SPANNING_CONFIG, at(23, 30));
  assert.equal(result?.matched, true);
  assert.equal(result?.provider, "cursor");
});

test("day-spanning matches early morning (01:00)", () => {
  const result = matchSlot(DAY_SPANNING_CONFIG, at(1, 0));
  assert.equal(result?.matched, true);
  assert.equal(result?.provider, "cursor");
});

test("day-spanning does not match gap after range (03:00)", () => {
  const result = matchSlot(DAY_SPANNING_CONFIG, at(3, 0));
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

// ── Timezone-aware matching ──

test("matchSlot evaluates injected now in configured timezone", () => {
  const tzConfig = {
    version: 1,
    timezone: "UTC",
    default: { provider: "deepseek", model: "deepseek-v4-pro" },
    slots: [{ from: "10:00", to: "15:00", provider: "cursor", model: "composer-2.5" }],
  };

  const inside = matchSlot(tzConfig, new Date("2026-01-01T11:00:00Z"));
  assert.equal(inside?.matched, true);
  assert.equal(inside?.provider, "cursor");

  const outside = matchSlot(tzConfig, new Date("2026-01-01T09:00:00Z"));
  assert.equal(outside?.matched, false);
  assert.equal(outside?.provider, "deepseek");
});

test("matchSlot uses timezone offset when injected now differs from local", () => {
  const tzConfig = {
    version: 1,
    timezone: "America/New_York",
    default: { provider: "deepseek", model: "deepseek-v4-pro" },
    slots: [{ from: "10:00", to: "15:00", provider: "cursor", model: "composer-2.5" }],
  };

  // 15:00 UTC = 10:00 EST (inclusive from)
  const atStart = matchSlot(tzConfig, new Date("2026-01-01T15:00:00Z"));
  assert.equal(atStart?.matched, true);
  assert.equal(atStart?.provider, "cursor");

  // 14:00 UTC = 09:00 EST (before slot)
  const before = matchSlot(tzConfig, new Date("2026-01-01T14:00:00Z"));
  assert.equal(before?.matched, false);
  assert.equal(before?.provider, "deepseek");
});

// ── DST transitions (America/New_York) ──
//
// Spring forward (2026-03-08): 02:00 local is skipped; clocks jump to 03:00.
// Fall back (2026-11-01): 01:00–01:59 repeats; Intl picks a canonical local time.
// These tests document Intl.DateTimeFormat behavior used by getNowInTimezone.

const NY_TZ = "America/New_York";

/** Config with Eastern timezone for DST boundary checks. */
function nyConfig(slots) {
  return {
    version: 1,
    timezone: NY_TZ,
    default: { provider: "deepseek", model: "deepseek-v4-pro" },
    slots,
  };
}

test("getNowInTimezone spring-forward: skipped 02:30 resolves to 03:30 Eastern", () => {
  // 07:30 UTC would be 02:30 EST, but that local time does not exist on transition day.
  const result = getNowInTimezone(NY_TZ, new Date("2026-03-08T07:30:00Z"));
  assert.equal(result.hours, 3);
  assert.equal(result.minutes, 30);
});

test("getNowInTimezone fall-back: ambiguous 01:30 resolves consistently via Intl", () => {
  // During the repeated hour, Intl maps this UTC instant to 01:30 Eastern.
  const result = getNowInTimezone(NY_TZ, new Date("2026-11-01T06:30:00Z"));
  assert.equal(result.hours, 1);
  assert.equal(result.minutes, 30);
});

test("matchSlot spring-forward: skipped hour matches post-transition slot, not pre-gap slot", () => {
  const skippedInstant = new Date("2026-03-08T07:30:00Z"); // Intl -> 03:30 Eastern

  const preGap = nyConfig([
    { from: "02:00", to: "03:00", provider: "pre-gap", model: "a" },
  ]);
  const postGap = nyConfig([
    { from: "03:00", to: "05:00", provider: "post-gap", model: "b" },
  ]);

  assert.equal(matchSlot(preGap, skippedInstant)?.matched, false);
  assert.equal(matchSlot(preGap, skippedInstant)?.provider, "deepseek");

  assert.equal(matchSlot(postGap, skippedInstant)?.matched, true);
  assert.equal(matchSlot(postGap, skippedInstant)?.provider, "post-gap");
});

test("matchSlot fall-back: ambiguous 01:30 matches first-hour slot in Eastern timezone", () => {
  const ambiguousInstant = new Date("2026-11-01T06:30:00Z"); // Intl -> 01:30 Eastern

  const firstHour = nyConfig([
    { from: "01:00", to: "02:00", provider: "first-hour", model: "a" },
  ]);
  const secondHour = nyConfig([
    { from: "02:00", to: "03:00", provider: "second-hour", model: "b" },
  ]);

  assert.equal(matchSlot(firstHour, ambiguousInstant)?.matched, true);
  assert.equal(matchSlot(firstHour, ambiguousInstant)?.provider, "first-hour");

  assert.equal(matchSlot(secondHour, ambiguousInstant)?.matched, false);
  assert.equal(matchSlot(secondHour, ambiguousInstant)?.provider, "deepseek");
});
