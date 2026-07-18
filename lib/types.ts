export const CONFIG_VERSION = 1;

export interface DefaultModel {
  provider: string;
  model: string;
}

export interface TimeSlot {
  from: string;
  to: string;
  provider: string;
  model: string;
}

export interface ScheduledRouterConfig {
  version: number;
  timezone?: string;
  default: DefaultModel;
  slots: TimeSlot[];
}

export interface SlotWarning {
  type: "masked-slot";
  slotIndex: number;
  slotRange: string;
  maskedBy: Array<{ slotIndex: number; slotRange: string }>;
  message: string;
}

export interface MatchResult {
  provider: string;
  model: string;
  matched: boolean;
  slotIndex?: number;
}

/** Shape of the raw YAML config before validation. */
export interface RawConfig {
  version: unknown;
  timezone?: unknown;
  default: unknown;
  slots: unknown;
}
