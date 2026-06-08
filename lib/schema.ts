import { Type, type TEnum, type TSchemaOptions } from "typebox";

/** Creates a TypeBox `TEnum` schema from a read-only array of string values. Useful for tool parameter enums that must match exactly one of a predefined set. */
export function StringEnum<const Values extends [string, ...string[]]>(
  values: readonly [...Values],
  options?: TSchemaOptions,
): TEnum<Values> {
  return Type.Enum([...values] as [string, ...string[]], options) as unknown as TEnum<Values>;
}
