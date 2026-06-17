import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { matchSlot } from "./matcher.ts";
import type { ScheduledRouterConfig } from "./types.ts";

export const STATUS_KEY = "scheduled-router";

/** Clears the scheduled-router status bar entry. */
export function clearScheduledRouterStatus(ctx: ExtensionContext): void {
  ctx.ui.setStatus(STATUS_KEY, undefined);
}

/**
 * Matches the current time slot, selects the model, and applies it via `pi.setModel()`.
 * Handles fallback to default when a matched slot's model is unavailable.
 */
export async function selectAndSetModel(
  pi: Pick<ExtensionAPI, "setModel">,
  ctx: ExtensionContext,
  config: ScheduledRouterConfig,
  nowOverride?: Date,
): Promise<boolean> {
  const match = matchSlot(config, nowOverride);
  if (!match) return false;

  const model = ctx.modelRegistry.find(match.provider, match.model);
  if (!model) {
    if (match.matched) {
      ctx.ui.notify(
        `Scheduled router: model ${match.provider}/${match.model} not found, falling back to default.`,
        "warning",
      );
      const defaultModel = ctx.modelRegistry.find(config.default.provider, config.default.model);
      if (defaultModel) {
        const success = await pi.setModel(defaultModel);
        if (success) {
          ctx.ui.setStatus(STATUS_KEY, `${config.default.provider}/${config.default.model}`);
        }
        return success;
      }
      ctx.ui.notify(
        `Scheduled router: default model ${config.default.provider}/${config.default.model} also not found.`,
        "warning",
      );
      return false;
    }

    ctx.ui.notify(
      `Scheduled router: default model ${config.default.provider}/${config.default.model} not found.`,
      "warning",
    );
    return false;
  }

  const success = await pi.setModel(model);
  if (success) {
    ctx.ui.setStatus(STATUS_KEY, `${match.provider}/${match.model}`);
  }
  return success;
}
