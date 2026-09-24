// Small time-zone helpers, built on nothing but Intl (already in Node) —
// no date library needed for a project this size.
//
// Business hours are defined in *local* wall-clock time ("9am Tuesday in
// the UK"), but Date objects and the Google Calendar API work in UTC
// instants. Converting between the two by hand (using the real IANA time
// zone database via Intl, rather than hardcoding "+01:00" or "+00:00") is
// what makes this keep working correctly across the UK's BST/GMT clock
// change in March and October, instead of quietly being an hour wrong for
// half the year.

export function zonedTimeToUtc(dateStr: string, timeStr: string, timeZone: string): Date {
  // dateStr: "2026-09-29", timeStr: "15:00"
  const naiveUtc = new Date(`${dateStr}T${timeStr}:00Z`);
  const offsetMs = getTimeZoneOffsetMs(naiveUtc, timeZone);
  return new Date(naiveUtc.getTime() - offsetMs);
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(dtf.formatToParts(date).map((p) => [p.type, p.value]));
  const asIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24, // Intl can report "24" for midnight
    Number(parts.minute),
    Number(parts.second)
  );
  return asIfUtc - date.getTime();
}

export function dayOfWeekInZone(dateStr: string, timeZone: string): number {
  // 0 = Sunday ... 6 = Saturday — for the calendar date as understood in
  // `timeZone`, not the server's own local time zone. Anchored at noon UTC
  // so the date itself can never roll over from the zone conversion.
  const noonUtc = new Date(`${dateStr}T12:00:00Z`);
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(noonUtc);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
}

export function toLocalTimeString(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}
