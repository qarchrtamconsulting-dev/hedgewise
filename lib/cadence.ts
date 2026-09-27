// Quinn's client cadence, counted from the first FanDuel bet (day 1).
// Plain functions with no imports, so the rules can be checked on their own.
//
//  Day 1       FanDuel min loss with a DraftKings hedge (this bet starts the clock)
//  Day 2       FanDuel reward stack: ask for a FanDuel screenshot, then play it
//  Day 3       FanDuel $25 bet match
//  Days 4–7    a FanDuel promo most days (deposit match or bet match)
//  Week 1      theScore gets started; its $250 deposit match posts 3 days after the first theScore bet
//  Days 8–30   a $500 FanDuel promo every Tuesday, Thursday and Sunday (deposit match, risk-free bet
//              or bet match). The check-in text and $0 FanDuel cash happen the day before:
//              Monday for Tuesday, Wednesday for Thursday, Friday for Sunday.
//  Day 31+     wrap-up
//  No play in 10+ days: gone quiet

export const PROMO_FIRST_DAY = 8;
export const PROMO_LAST_DAY = 30;
export const QUIET_AFTER_DAYS = 10;
export const THESCORE_MATCH_DELAY = 3;

// ── Dates are YYYY-MM-DD strings: local calendar days, no time zones ──
const utc = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split("-").map(Number); return Date.UTC(y, m - 1, d); };
export const addDays = (iso: string, n: number) => new Date(utc(iso) + n * 86400000).toISOString().slice(0, 10);
export const daysBetween = (from: string, to: string) => Math.round((utc(to) - utc(from)) / 86400000);
export const weekday = (iso: string) => new Date(utc(iso)).getUTCDay();          // 0 Sun … 6 Sat
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const weekdayName = (iso: string) => DAY_NAMES[weekday(iso)];
/** "2026-09-27" -> "Sun Sep 27" */
export const dayLabel = (iso: string) => {
  const d = new Date(utc(iso));
  return `${DAY_NAMES[d.getUTCDay()].slice(0, 3)} ${d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`;
};

/** $500 FanDuel promos drop on these weekdays. */
const PROMO_WEEKDAYS = new Set([2, 4, 0]);                // Tue, Thu, Sun
/** Check-in / zero-out weekday → how many days until the promo it sets up. */
const CHECK_IN_AHEAD: Record<number, number> = { 1: 1, 3: 1, 5: 2 };   // Mon→Tue, Wed→Thu, Fri→Sun
export const isZeroOutDay = (iso: string) => CHECK_IN_AHEAD[weekday(iso)] != null;
/** The promo day a zero-out day sets up (Mon → Tue, Wed → Thu, Fri → Sun); null on other days. */
export const promoAfter = (iso: string) => { const a = CHECK_IN_AHEAD[weekday(iso)]; return a == null ? null : addDays(iso, a); };

// ── Inputs ──
export interface CadencePlay {
  date: string | null;        // placed_on, else the date of its first bet
  status: string;             // sent | open | settled | void
  promo: string | null;
  books: string[];            // books on any of its bets
  promoBooks: string[];       // the play's own book plus its promo-side bets
}

/** A play row with its bets, as the app loads it. */
export interface PlayLike {
  status: string; promo: string | null; book: string | null; placed_on: string | null;
  legs?: { book: string | null; side: string; event_time: string | null }[] | null;
}
export function toCadencePlay(p: PlayLike): CadencePlay {
  const legs = p.legs || [];
  const uniq = (xs: (string | null | undefined)[]) => Array.from(new Set(xs.filter(Boolean) as string[]));
  const firstBet = legs.map(l => l.event_time).filter(Boolean).map(t => (t as string).slice(0, 10)).sort()[0];
  return {
    date: p.placed_on || firstBet || null,
    status: p.status,
    promo: p.promo,
    books: uniq(legs.map(l => l.book)),
    promoBooks: uniq([p.book, ...legs.filter(l => l.side === "promo").map(l => l.book)]),
  };
}

const counts = (p: CadencePlay) => p.status !== "void" && p.status !== "sent" && !!p.date;
/** Start date rule: any bet on FanDuel (same rule as client_summary.started_on). */
const isFanDuelBet = (p: CadencePlay) => p.books.includes("FanDuel");

// Which book's offer a play used. The promo text is the best signal ("fd 500 fb", "tsb 1k rfb",
// "dk 400 fb / fd min loss"); the play's book is the fallback when the text names no book.
const FD_WORD = /\b(fd|fanduel)\b/i;
const TSB_WORD = /\b(tsb|thescore|the score|espn)\b/i;
const ANY_BOOK = /\b(fd|fanduel|dk|draftkings|tsb|thescore|the score|espn|mgm|betmgm|czr|caesars|br|betrivers|bet ?365|fanatics|fan|hard ?rock|hr|borgata|hollywood|bally|fliff)\b/i;
const offerFrom = (p: CadencePlay, word: RegExp, book: string) => {
  const promo = p.promo || "";
  if (/casino/i.test(promo)) return false;
  return word.test(promo) || (!ANY_BOOK.test(promo) && p.promoBooks.includes(book));
};
/** Used a FanDuel offer (a FanDuel hedge on another book's promo doesn't count). */
const playedFanDuel = (p: CadencePlay) => offerFrom(p, FD_WORD, "FanDuel");
const isTheScoreBet = (p: CadencePlay) => offerFrom(p, TSB_WORD, "theScore Bet");

// ── Where a client is ──
export type Lane = "not_started" | "week1" | "promo" | "wrap" | "quiet";

export interface ClientCadence {
  startedOn: string | null;      // first FanDuel bet
  day: number | null;            // FanDuel day today (the first bet is day 1)
  lastPlay: string | null;
  quietDays: number | null;      // days since the last play
  theScoreFirst: string | null;  // first theScore bet
  theScoreMatchOn: string | null;
  nextPromoOn: string | null;    // next Tue/Thu/Sun that falls inside days 8–30, from today on
  lane: Lane;
}

export const dayOn = (startedOn: string, date: string) => daysBetween(startedOn, date) + 1;

export function cadenceFor(plays: CadencePlay[], today: string): ClientCadence {
  const ps = plays.filter(counts);
  const minDate = (xs: CadencePlay[]) => xs.reduce<string | null>((m, p) => (!m || p.date! < m ? p.date! : m), null);
  const startedOn = minDate(ps.filter(isFanDuelBet));
  const lastPlay = ps.reduce<string | null>((m, p) => (!m || p.date! > m ? p.date! : m), null);
  const theScoreFirst = minDate(ps.filter(isTheScoreBet));
  const day = startedOn ? dayOn(startedOn, today) : null;
  const quietDays = lastPlay ? daysBetween(lastPlay, today) : null;

  let lane: Lane;
  if (!startedOn || day == null) lane = "not_started";
  else if (quietDays != null && quietDays >= QUIET_AFTER_DAYS) lane = "quiet";
  else if (day > PROMO_LAST_DAY) lane = "wrap";
  else if (day >= PROMO_FIRST_DAY) lane = "promo";
  else lane = "week1";

  let nextPromoOn: string | null = null;
  if (startedOn) {
    for (let i = 0; i < 8 && !nextPromoOn; i++) {
      const d = addDays(today, i);
      const n = dayOn(startedOn, d);
      if (PROMO_WEEKDAYS.has(weekday(d)) && n >= PROMO_FIRST_DAY && n <= PROMO_LAST_DAY) nextPromoOn = d;
    }
  }

  return {
    startedOn, day, lastPlay, quietDays, theScoreFirst,
    theScoreMatchOn: theScoreFirst ? addDays(theScoreFirst, THESCORE_MATCH_DELAY) : null,
    nextPromoOn, lane,
  };
}

/** Where a week-1 client is in the FanDuel sequence. */
export function weekOneStep(day: number): string {
  if (day <= 1) return "Min loss";
  if (day === 2) return "Reward stack";
  if (day === 3) return "$25 bet match";
  return "FanDuel promos";
}

// ── The checklist ──
export type TaskKind = "fd_reward_stack" | "fd_bet_match" | "fd_week1_promo" | "tsb_start" | "tsb_match" | "fd_check_in" | "fd_promo";
export type SendKind = "fanduel" | "thescore" | "checkin";

export interface Task {
  kind: TaskKind;
  dueOn: string;          // the date this item belongs to (its key, with the client and kind)
  day: number;            // FanDuel day on dueOn
  title: string;
  detail: string;
  send?: SendKind;        // a text to send; otherwise it's a play to make
  done: boolean;          // already covered by a logged play
  lateDays: number;       // carried over from an earlier day
}

export const KIND_LABEL: Record<TaskKind, string> = {
  fd_promo: "$500 FanDuel promo",
  fd_check_in: "Check-in · FanDuel $0 by midnight",
  fd_reward_stack: "FanDuel reward stack",
  tsb_match: "theScore $250 deposit match",
  fd_week1_promo: "FanDuel promo (week 1)",
  fd_bet_match: "FanDuel $25 bet match",
  tsb_start: "Start theScore",
};

/** Priority on the list: FanDuel promo day first, new apps last. */
export const KIND_ORDER: TaskKind[] = ["fd_promo", "fd_check_in", "fd_reward_stack", "tsb_match", "fd_week1_promo", "fd_bet_match", "tsb_start"];

/** How many days an unfinished item stays on the list after its day. */
const GRACE: Partial<Record<TaskKind, number>> = { tsb_match: 3, fd_reward_stack: 1, fd_promo: 1 };

/** The items that belong to one date. */
export function tasksOn(c: ClientCadence, plays: CadencePlay[], date: string): Task[] {
  if (!c.startedOn || c.lane === "quiet" || c.lane === "not_started") return [];
  const n = dayOn(c.startedOn, date);
  if (n < 1) return [];
  const ps = plays.filter(counts);
  // A FanDuel offer logged on this day or later covers a FanDuel item.
  const fanDuelSince = ps.some(p => p.date! >= date && playedFanDuel(p));
  const out: Task[] = [];
  const add = (t: Omit<Task, "lateDays" | "dueOn" | "day"> & { dueOn?: string }) =>
    out.push({ dueOn: date, day: n, lateDays: 0, ...t });

  if (n === 2) add({ kind: "fd_reward_stack", title: "FanDuel reward stack", detail: "Day 2 · ask for a FanDuel screenshot, then play it", send: "fanduel", done: fanDuelSince });
  if (n === 3) add({ kind: "fd_bet_match", title: "FanDuel $25 bet match", detail: "Day 3", done: fanDuelSince });
  if (n >= 4 && n <= 7) add({ kind: "fd_week1_promo", title: "FanDuel promo", detail: `Day ${n} · usually a deposit match or bet match`, send: "fanduel", done: fanDuelSince });

  // theScore should be going in week 1. One open item until the first theScore bet is logged.
  const hasTheScore = !!c.theScoreFirst && c.theScoreFirst <= date;
  if (n >= 2 && n <= PROMO_LAST_DAY && !hasTheScore) {
    add({ kind: "tsb_start", dueOn: c.startedOn, title: "Start theScore",
      detail: n <= 7 ? `Week 1 · day ${n} of 7` : `Usually done in week 1 · now day ${n}`, done: false });
  }

  if (c.theScoreMatchOn === date) {
    add({ kind: "tsb_match", title: "theScore $250 deposit match", detail: "3 days after the first theScore bet", send: "thescore",
      done: ps.some(p => p.date! >= date && isTheScoreBet(p)) });
  }

  const wd = weekday(date);
  const ahead = CHECK_IN_AHEAD[wd];
  if (ahead != null) {
    const promoDay = n + ahead;
    if (promoDay >= PROMO_FIRST_DAY && promoDay <= PROMO_LAST_DAY) {
      add({ kind: "fd_check_in", title: `Check-in for ${weekdayName(addDays(date, ahead))}'s $500 promo`,
        detail: "Screenshots, then FanDuel cash to $0 by midnight", send: "checkin", done: false });
    }
  }
  if (PROMO_WEEKDAYS.has(wd) && n >= PROMO_FIRST_DAY && n <= PROMO_LAST_DAY) {
    add({ kind: "fd_promo", title: "$500 FanDuel promo", detail: `Day ${n} · deposit match, risk-free bet or bet match`, done: fanDuelSince });
  }
  return out;
}

/** Today's list: today's items plus unfinished ones from the last few days that are still worth doing. */
export function tasksForToday(c: ClientCadence, plays: CadencePlay[], today: string): Task[] {
  const out = tasksOn(c, plays, today);
  for (let back = 1; back <= 3; back++) {
    for (const t of tasksOn(c, plays, addDays(today, -back))) {
      if (t.kind === "tsb_start") continue;                      // already on today's list
      if ((GRACE[t.kind] || 0) >= back && !t.done) out.push({ ...t, lateDays: back });
    }
  }
  return out;
}

// ── Texts ──
const SEND_APPS: Record<SendKind, string[]> = { checkin: ["FanDuel", "DraftKings"], fanduel: ["FanDuel"], thescore: ["theScore"] };
const APP_ORDER = ["FanDuel", "DraftKings", "theScore"];

/** The apps to ask screenshots of, for a set of items. */
export function appsFor(sends: SendKind[]): string[] {
  const s = new Set(sends.flatMap(k => SEND_APPS[k]));
  return APP_ORDER.filter(a => s.has(a));
}

/** One text that covers every screenshot a client's items need. */
export function screenshotText(apps: string[], firstName: string): string {
  if (apps.length <= 1) return `Hey ${firstName}, can you send me a screenshot of your ${apps[0] || "FanDuel"} home screen?`;
  const list = apps.length === 2 ? apps.join(" and ") : `${apps.slice(0, -1).join(", ")} and ${apps[apps.length - 1]}`;
  return `Hey ${firstName}, can you log into ${list} and grab a screenshot of your home screen?`;
}
