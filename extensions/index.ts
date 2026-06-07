import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { load as parseYaml, dump as stringifyYaml } from "js-yaml";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { StringEnum } from "../lib/schema.ts";
import { loadConfig, resolveConfigPath, validateConfig } from "../lib/config.ts";
import { CONFIG_FILENAME, projectConfigPath } from "../lib/paths.ts";
import { matchSlot, getNowInTimezone } from "../lib/matcher.ts";
import type { MatchResult, ScheduledRouterConfig } from "../lib/types.ts";

const STATUS_KEY = "scheduled-router";

export default function scheduledRouter(pi: ExtensionAPI) {
  let config: ScheduledRouterConfig | undefined;
  let currentMatch: MatchResult | undefined;
  let configPath: string | undefined;

  async function ensureConfig(ctx: ExtensionContext): Promise<boolean> {
    if (config) return true;
    configPath = resolveConfigPath(ctx) ?? projectConfigPath(ctx.cwd);
    config = loadConfig(ctx);
    return config !== undefined;
  }

  async function trySelectModel(ctx: ExtensionContext): Promise<void> {
    if (!(await ensureConfig(ctx)) || !config) return;

    const match = matchSlot(config);
    currentMatch = match;
    if (!match) return;

    const model = ctx.modelRegistry.find(match.provider, match.model);
    if (!model) {
      if (match.matched) {
        ctx.ui.notify(
          `Scheduled router: ${match.provider}/${match.model} not found, falling back to default.`,
          "warning",
        );
        const defaultModel = ctx.modelRegistry.find(config.default.provider, config.default.model);
        if (defaultModel) {
          await pi.setModel(defaultModel);
          ctx.ui.setStatus(STATUS_KEY, `default:${config.default.provider}/${config.default.model}`);
          return;
        }
        ctx.ui.notify(
          `Scheduled router: default ${config.default.provider}/${config.default.model} also not found.`,
          "warning",
        );
        return;
      }

      ctx.ui.notify(
        `Scheduled router: default ${match.provider}/${match.model} not found.`,
        "warning",
      );
      return;
    }

    const success = await pi.setModel(model);
    if (success) {
      ctx.ui.setStatus(STATUS_KEY, `${match.provider}/${match.model}`);
    }
  }

  function clearStatus(ctx: ExtensionContext): void {
    ctx.ui.setStatus(STATUS_KEY, undefined);
    config = undefined;
    currentMatch = undefined;
    configPath = undefined;
  }

  function formatStatus(): string {
    const nowTz = config?.timezone;
    const local = getNowInTimezone(nowTz);
    const tzSuffix = nowTz ? ` ${nowTz}` : "";

    const lines: string[] = [
      `Current time: ${String(local.hours).padStart(2, "0")}:${String(local.minutes).padStart(2, "0")}${tzSuffix}`,
      `Timezone:     ${nowTz ?? "system-local"}`,
    ];

    if (!currentMatch) {
      lines.push("Status:      not evaluated (config not loaded)");
    } else if (currentMatch.matched) {
      const slotIndex = currentMatch.slotIndex ?? -1;
      const slot = config?.slots[slotIndex];
      const range = slot ? `${slot.from}-${slot.to}` : "?";
      lines.push(`Matched:      slot[${slotIndex}] ${range} → ${currentMatch.provider}/${currentMatch.model}`);
    } else {
      lines.push(`Matched:      no slot, using default → ${currentMatch.provider}/${currentMatch.model}`);
    }

    const resolvedPath = configPath ?? "(not configured)";
    lines.push(`Config:      ${resolvedPath}`);

    return lines.join("\n");
  }

  // ── Session lifecycle ──

  pi.on("session_start", async (_event, ctx) => {
    await trySelectModel(ctx);
  });

  pi.on("session_shutdown", (_event, ctx) => {
    clearStatus(ctx);
  });

  // ── Commands ──

  pi.registerCommand("scheduled:status", {
    description: "Show current scheduled router status (time, matched slot, model)",
    handler: async (_args, ctx) => {
      await ensureConfig(ctx);
      ctx.ui.notify(formatStatus(), "info");
    },
  });

  pi.registerCommand("scheduled:configure", {
    description: "Guide to configure scheduled router time slots",
    handler: async (_args, _ctx) => {
      pi.sendUserMessage(buildConfigurePrompt(config));
    },
  });

  // ── Tool ──

  pi.registerTool({
    name: "scheduled_router_config",
    label: "Scheduled Router Config",
    description: "Read, validate, or save pi-scheduled-router YAML configuration.",
    promptSnippet: "Read, validate, or save scheduled router YAML configuration after user asks.",
    promptGuidelines: [
      "Use scheduled_router_config when the user asks to configure or inspect pi-scheduled-router.",
      "Use scheduled_router_config with action=save only after preparing the complete YAML config for the user; the tool asks for confirmation before saving.",
    ],
    parameters: Type.Object({
      action: StringEnum(["read", "status", "validate", "save"] as const),
      configYaml: Type.Optional(Type.String({ description: "Full scheduled-router.yaml content for validate or save." })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (params.action === "status") {
        await ensureConfig(ctx);
        return textResult(formatStatus());
      }

      if (params.action === "read") {
        const cfgPath = resolveConfigPath(ctx);
        if (!cfgPath) return textResult("", { configured: false, configPath: undefined });
        const content = await readFile(cfgPath, "utf8");
        return textResult(content, { configPath: cfgPath, configured: true });
      }

      if (!params.configYaml) {
        throw new Error("configYaml is required for validate/save.");
      }

      // Parse
      let parsed: unknown;
      try {
        parsed = parseYaml(params.configYaml);
      } catch (err) {
        return textResult(`Config is not valid YAML: ${errorMessage(err)}`, { valid: false });
      }

      // Validate
      let validated: ScheduledRouterConfig;
      try {
        validated = validateConfig(parsed);
      } catch (err) {
        return textResult(`Config validation failed: ${errorMessage(err)}`, { valid: false });
      }

      if (params.action === "validate") {
        return textResult("Config is valid.", { valid: true, config: yamlStringify(validated) });
      }

      // action === "save"
      if (!ctx.hasUI) {
        return textResult("Config not saved: confirmation UI is unavailable.", { saved: false, configPath: configPath });
      }

      const ok = await ctx.ui.confirm("Save scheduled router config?", summarizeConfig(validated));
      if (!ok) return textResult("Config not saved.", { saved: false, configPath: configPath });

      const writeTarget = configPath ?? join(getAgentDir(), CONFIG_FILENAME);
      const yamlText = stringifyYaml(parsed, { indent: 2, noRefs: true, lineWidth: 120 });

      // Ensure .pi directory exists
      const { mkdir } = await import("node:fs/promises");
      const { dirname } = await import("node:path");
      await mkdir(dirname(writeTarget), { recursive: true });
      await writeFile(writeTarget, yamlText, "utf8");

      // Reload and reselect
      config = undefined;
      configPath = writeTarget;
      await ensureConfig(ctx);
      await trySelectModel(ctx);

      return textResult("Config saved and model reselected.", { saved: true, configPath: writeTarget });
    },
  });
}

// ── Helpers ──

function buildConfigurePrompt(currentConfig: ScheduledRouterConfig | undefined): string {
  const configText = currentConfig ? yamlStringify(currentConfig) : "(not configured)";
  return [
    "Start pi-scheduled-router configuration setup.",
    "",
    "Use this conversation to decide time slots and models with me.",
    "Ask one question at a time. First confirm which provider/model should be the default, then which time slots to define.",
    "Recommend a balanced default schedule if I am unsure.",
    "When the configuration is settled, call scheduled_router_config with action=save and the full YAML content.",
    "The tool must confirm before saving.",
    "",
    "Current config:",
    configText,
  ].join("\n");
}

function yamlStringify(config: ScheduledRouterConfig): string {
  const lines: string[] = ["version: 1"];
  if (config.timezone) lines.push(`timezone: "${config.timezone}"`);
  lines.push("default:");
  lines.push(`  provider: ${config.default.provider}`);
  lines.push(`  model: ${config.default.model}`);
  lines.push("slots:");
  for (const slot of config.slots) {
    lines.push(`  - from: "${slot.from}"`);
    lines.push(`    to: "${slot.to}"`);
    lines.push(`    provider: ${slot.provider}`);
    lines.push(`    model: ${slot.model}`);
  }
  return lines.join("\n");
}

function summarizeConfig(config: ScheduledRouterConfig): string {
  const slots = config.slots
    .map((s, i) => `  ${i}: ${s.from}-${s.to} → ${s.provider}/${s.model}`)
    .join("\n");
  return [
    `Timezone: ${config.timezone ?? "system-local"}`,
    `Default:  ${config.default.provider}/${config.default.model}`,
    `Slots (${config.slots.length}):`,
    slots,
  ].join("\n");
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function textResult(text: string, details: Record<string, unknown> = {}) {
  return { content: [{ type: "text" as const, text }], details };
}
