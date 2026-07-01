/** Format current date/time for status display (e.g. `2026-06-07 14:23 JST`). */
export function formatCurrentDateTime(tz?: string, date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    ...(tz ? { timeZone: tz } : {}),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZoneName: "short",
  });

  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const datePart = `${parts.year}-${parts.month}-${parts.day}`;
  const timePart = `${parts.hour}:${parts.minute}`;
  const tzName = parts.timeZoneName?.trim();
  return tzName ? `${datePart} ${timePart} ${tzName}` : `${datePart} ${timePart}`;
}
