// Who should see a promo, and when. Worked out from each client's FanDuel day (lib/cadence), nothing stored.
//  - FanDuel $500: every Tue / Thu / Sun on days 8–30.
//  - theScore $250: 3 days after the first theScore bet, until a theScore play is logged on or after that day.
import { PROMO_FIRST_DAY, addDays, dayOn, isPromoDate, offerBooksOf, tasksOn, toCadencePlay, weekday } from "@/lib/cadence";
import type { OpsEntry } from "@/lib/ops";

export interface PromoHit {
  kind: "fd500" | "tsb250";
  date: string;
  day: number | null;         // FanDuel day on that date
  n: number | null;           // which FanDuel promo this is for them (#1, #2 …), when we can tell
  first: boolean;             // their first promo day
  last: boolean;              // no promo day after this one
  lateDays: number;           // a theScore match that was due before today and still isn't logged
}

export interface PromoPlan {
  e: OpsEntry;
  logged: number;             // FanDuel promos played from day 8 on (one per date)
  missed: boolean;            // promo days have passed and none is logged
  hits: PromoHit[];
}

const PROMO_WEEKDAYS = new Set([2, 4, 0]);

/** The next promo weekday from `today` on (today itself when it is one). */
export function nextPromoDay(today: string) {
  for (let i = 0; i < 7; i++) { const d = addDays(today, i); if (PROMO_WEEKDAYS.has(weekday(d))) return d; }
  return today;
}

/** FanDuel promo plays from day 8 on, counted once per date (a promo split across two plays counts once). */
export function fanDuelPromosLogged(e: OpsEntry) {
  const start = e.cad.startedOn;
  if (!start) return { n: 0, dates: [] as string[] };
  const dates = new Set<string>();
  e.raw.forEach(p => {
    if (p.status !== "open" && p.status !== "settled") return;
    const cp = toCadencePlay(p);
    if (!cp.date || dayOn(start, cp.date) < PROMO_FIRST_DAY) return;
    if (/min ?loss/i.test(p.promo || "")) return;
    if (offerBooksOf(cp).includes("FanDuel")) dates.add(cp.date);
  });
  return { n: dates.size, dates: Array.from(dates).sort() };
}

/** Promo days in [from, from + days), plus theScore matches up to 3 days overdue. */
export function planFor(e: OpsEntry, today: string, days = 7): PromoPlan {
  const hits: PromoHit[] = [];
  const start = e.cad.startedOn;
  const { n: logged } = fanDuelPromosLogged(e);

  let missed = false;
  if (start) {
    const passed: string[] = [];
    for (let i = PROMO_FIRST_DAY; ; i++) {
      const d = addDays(start, i - 1);
      if (d >= addDays(today, -1)) break;               // yesterday's may just not be logged yet
      if (isPromoDate(start, d)) passed.push(d);
      if (i > 60) break;
    }
    missed = passed.length > 0 && logged === 0;

    let count = logged;
    let known = logged > 0;
    const promoDaysBefore = (d: string) => { for (let i = PROMO_FIRST_DAY; ; i++) { const x = addDays(start, i - 1); if (x >= d) return false; if (isPromoDate(start, x)) return true; } };
    for (let k = 0; k < days; k++) {
      const d = addDays(today, k);
      if (!isPromoDate(start, d)) continue;
      count += 1;
      const first = !promoDaysBefore(d);
      if (first) known = true;
      let last = true;
      for (let j = 1; j <= 7; j++) if (isPromoDate(start, addDays(d, j))) { last = false; break; }
      hits.push({ kind: "fd500", date: d, day: dayOn(start, d), n: known ? count : null, first, last, lateDays: 0 });
    }
  }

  const m = e.cad.theScoreMatchOn;
  if (m && m >= addDays(today, -3) && m < addDays(today, days)) {
    const done = tasksOn({ ...e.cad, lane: e.cad.lane === "quiet" ? "promo" : e.cad.lane }, e.plays, m).some(t => t.kind === "tsb_match" && t.done);
    if (!done) {
      const date = m < today ? today : m;
      hits.push({ kind: "tsb250", date, day: start ? dayOn(start, date) : null, n: null, first: false, last: false, lateDays: Math.max(0, Math.round((Date.parse(today) - Date.parse(m)) / 86400000)) });
    }
  }
  return { e, logged, missed, hits };
}

export function planAll(entries: OpsEntry[], today: string, days = 7) {
  return entries.map(e => planFor(e, today, days));
}
