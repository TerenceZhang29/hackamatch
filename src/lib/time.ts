/**
 * Dates in the app's time zone (APP_TIMEZONE, America/New_York by default).
 * "Today", "upcoming" and "one digest per day" all use the local date, never UTC.
 */

/** `YYYY-MM-DD` for `date` as seen in `timeZone`. */
export function localDateString(timeZone: string, date: Date = new Date()): string {
  // en-CA formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** "Oct 30" or "Oct 30 – Nov 1" for an event's `YYYY-MM-DD` dates. */
export function formatDateRange(start: string, end: string): string {
  const format = (value: string) =>
    new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(
      new Date(`${value}T00:00:00Z`),
    );
  return start === end ? format(start) : `${format(start)} – ${format(end)}`;
}
