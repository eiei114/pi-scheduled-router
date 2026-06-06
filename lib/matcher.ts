import type { MatchResult, ScheduledRouterConfig } from "./types.ts";

/** Parse "HH:MM" into total minutes from midnight. */
function parseMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

/** Get current hour/minute in a target IANA timezone (or system local). */
export function getNowInTimezone(tz?: string): { hours: number; minutes: number } {
  if (!tz) {
    const now = new Date();
    return { hours: now.getHours(), minutes: now.getMinutes() };
  }

  const formatter = new Intl.DateTimeFormat("en", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const [hours, minutes] = formatter.format(new Date()).split(":").map(Number);
  return { hours, minutes };
}

/**
 * Match the current time against the configured slots (first-match wins).
 *
 * Returns the matching slot's provider/model, or `default` if no slot matches.
 * Returns `undefined` when config is falsy.
 */
export function matchSlot(
  config: ScheduledRouterConfig | undefined,
  nowOverride?: Date,
): MatchResult | undefined {
  if (!config) return undefined;

  const { hours, minutes } = nowOverride
    ? { hours: nowOverride.getHours(), minutes: nowOverride.getMinutes() }
    : getNowInTimezone(config.timezone);

  const nowMinutes = hours * 60 + minutes;

  for (let i = 0; i < config.slots.length; i++) {
    const slot = config.slots[i];
    const fromMin = parseMinutes(slot.from);
    const toMin = parseMinutes(slot.to);

    let inRange: boolean;
    if (fromMin <= toMin) {
      // Normal range: e.g. 10:00-15:00
      inRange = nowMinutes >= fromMin && nowMinutes < toMin;
    } else {
      // Day-spanning: e.g. 22:00-02:00
      inRange = nowMinutes >= fromMin || nowMinutes < toMin;
    }

    if (inRange) {
      return { provider: slot.provider, model: slot.model, matched: true, slotIndex: i };
    }
  }

  // no slot matched → default
  return {
    provider: config.default.provider,
    model: config.default.model,
    matched: false,
  };
}
