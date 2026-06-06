import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { load as parseYaml } from "js-yaml";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { CONFIG_VERSION, type RawConfig, type ScheduledRouterConfig, type TimeSlot } from "./types.ts";

const CONFIG_FILENAME = "scheduled-router.yaml";

/** Resolves the config path: project-local `.pi/` first, then agent dir. */
export function resolveConfigPath(ctx: ExtensionContext): string | undefined {
  const projectPath = join(ctx.cwd, ".pi", CONFIG_FILENAME);
  if (existsSync(projectPath)) return projectPath;

  const agentPath = join(getAgentDir(), CONFIG_FILENAME);
  if (existsSync(agentPath)) return agentPath;

  return undefined;
}

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

function validateDefault(value: unknown): { provider: string; model: string } {
  if (!isRecord(value)) throw new Error("default must be an object.");
  return {
    provider: nonEmptyString(value.provider, "default.provider"),
    model: nonEmptyString(value.model, "default.model"),
  };
}

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
