// Time-zone helpers for server code, which runs in UTC. Game times are stored as Eastern wall-clock times.

/** Minutes-precise offset of a time zone from UTC at a given instant, in ms (e.g. -4h for EDT). */
function offsetMs(ms: number, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(ms));
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value || 0);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - ms;
}

/** "2026-09-26T19:15:00" in a time zone -> epoch ms. */
export function zonedToMs(local: string, tz: string) {
  const [d, t = "00:00:00"] = local.slice(0, 19).split("T");
  const [y, m, day] = d.split("-").map(Number);
  const [hh = 0, mm = 0, ss = 0] = t.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, day, hh, mm, ss);
  const first = guess - offsetMs(guess, tz);
  return guess - offsetMs(first, tz);          // second pass settles DST edges
}

/** Today's date (YYYY-MM-DD) in a time zone. */
export function todayIn(tz: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
