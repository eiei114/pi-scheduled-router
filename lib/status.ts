import { formatCurrentDateTime } from "./status-format.ts";
import type { MatchResult, ScheduledRouterConfig } from "./types.ts";

export { formatCurrentDateTime } from "./status-format.ts";

export interface StatusContext {
  config?: ScheduledRouterConfig;
  currentMatch?: MatchResult;
  configPath?: string;
  now?: Date;
}

/** Format scheduled router status for commands and tool output. */
export function formatScheduledRouterStatus(ctx: StatusContext): string {
  const { config, currentMatch, configPath, now = new Date() } = ctx;
  const timezone = config?.timezone;

  const lines: string[] = [
    `Current time: ${formatCurrentDateTime(timezone, now)}`,
    `Timezone:    ${timezone ?? "system-local"}`,
  ];

  if (!config || !currentMatch) {
    lines.push("Status:     not evaluated (config not loaded)");
  } else if (currentMatch.matched) {
    const slotIndex = currentMatch.slotIndex ?? -1;
    const slot = config.slots[slotIndex];
    const range = slot ? `${slot.from}-${slot.to}` : "?";
    lines.push(`Matched:     slot[${slotIndex}] ${range} → ${currentMatch.provider}/${currentMatch.model}`);
  } else {
    lines.push(`Matched:     No slot matched, using default: ${currentMatch.provider}/${currentMatch.model}`);
  }

  lines.push(`Config:      ${configPath ?? "(not configured)"}`);

  return lines.join("\n");
}
