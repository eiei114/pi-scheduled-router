import { readFileSync } from "node:fs";
import { load as parseYaml } from "js-yaml";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { CONFIG_VERSION, type ScheduledRouterConfig, type TimeSlot } from "./types.ts";
import { CONFIG_FILENAME, resolveConfigPath } from "./paths.ts";

export { resolveConfigPath } from "./paths.ts";

/** Attempts to load, parse, and validate the YAML config. Notifies on failure. */
export function loadConfig(ctx: ExtensionContext): ScheduledRouterConfig | undefined {
  const configPath = resolveConfigPath(ctx);
  if (!configPath) {
    ctx.ui.notify(
      `Scheduled router: config not found. Create ~/.pi/${CONFIG_FILENAME} or <project>/.pi/${CONFIG_FILENAME}.`,
      "warning",
    );
    return undefined;
  }

  let raw: unknown;
  try {
    const text = readFileSync(configPath, "utf8");
    raw = parseYaml(text);
  } catch (error) {
    ctx.ui.notify(`Scheduled router: failed to parse YAML config: ${errorMessage(error)}`, "warning");
    return undefined;
  }

  try {
    return validateConfig(raw);
  } catch (error) {
    ctx.ui.notify(`Scheduled router: invalid config: ${errorMessage(error)}`, "warning");
    return undefined;
  }
}

// ── Validation (exported for tool usage) ──

/** Validates a parsed YAML value and returns a typed `ScheduledRouterConfig`. */
export function validateConfig(value: unknown): ScheduledRouterConfig {
  if (!isRecord(value)) throw new Error("config must be an object.");

  if (value.version !== CONFIG_VERSION) {
    throw new Error(`Unsupported config version ${String(value.version)}. Expected ${CONFIG_VERSION}.`);
  }

  const timezone = validateTimezoneField(value.timezone);
  const defaultModel = validateDefault(value.default);
  const slots = validateSlots(value.slots);

  return { version: CONFIG_VERSION, timezone, default: defaultModel, slots };
}

/** Validates an optional IANA timezone name. Returns `undefined` when the field is absent. Throws on invalid timezone. */
function validateTimezoneField(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("timezone must be a non-empty string.");
  }
  try {
    Intl.DateTimeFormat("en", { timeZone: value });
    return value;
  } catch {
    throw new Error(`Invalid timezone: "${value}".`);
  }
}

/** Validates the required `default` provider/model block. Expects an object with non-empty `provider` and `model` strings. */
function validateDefault(value: unknown): { provider: string; model: string } {
  if (!isRecord(value)) throw new Error("default must be an object.");
  return {
    provider: nonEmptyString(value.provider, "default.provider"),
    model: nonEmptyString(value.model, "default.model"),
  };
}

/** Validates the `slots` array and each time-slot entry. Requires at least one slot. Each slot must have `from`, `to`, `provider`, and `model` fields in `HH:MM` format. */
function validateSlots(value: unknown): TimeSlot[] {
  if (!Array.isArray(value)) throw new Error("slots must be an array.");
  if (value.length === 0) throw new Error("slots must include at least one entry.");

  return value.map((entry, index) => {
    if (!isRecord(entry)) throw new Error(`slots[${index}] must be an object.`);
    const from = nonEmptyString(entry.from, `slots[${index}].from`);
    const to = nonEmptyString(entry.to, `slots[${index}].to`);
    validateHhMm(from, `slots[${index}].from`);
    validateHhMm(to, `slots[${index}].to`);
    return {
      from,
      to,
      provider: nonEmptyString(entry.provider, `slots[${index}].provider`),
      model: nonEmptyString(entry.model, `slots[${index}].model`),
    };
  });
}

/** Ensures a time string is in `HH:MM` format with valid hour/minute ranges. `24:00` is allowed; `24:01`–`24:59` are rejected. */
function validateHhMm(value: string, label: string): void {
  if (!/^\d{2}:\d{2}$/.test(value)) {
    throw new Error(`${label} must be HH:MM format, got "${value}".`);
  }
  const [h, m] = value.split(":").map(Number);
  if (h < 0 || h > 24 || m < 0 || m > 59 || (h === 24 && m !== 0)) {
    throw new Error(`${label} invalid time "${value}".`);
  }
}

// ── Helpers ──

/** Type guard: returns `true` if `value` is a plain object (non-null, non-array). */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Asserts `value` is a non-empty string. Throws with `label` in the message on failure. */
function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

/** Converts an unknown caught error to a string. Uses `Error.message` when available. */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
