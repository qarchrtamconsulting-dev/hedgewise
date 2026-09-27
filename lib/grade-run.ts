// Following games and grading open plays. Shared by the browser (Today, "Check scores") and the scheduled server job.
import type { Leg, Play } from "@/lib/db";
import { findGame, gradePlay } from "@/lib/grade";
import type { GameRef, ScoreEvent } from "@/lib/grade";
import { settlePlayCore, staysOpen, waitingOnSecondLeg } from "@/lib/settle-core";

export const GAME_LENGTH_MS = 3.5 * 3600e3;   // fallback: a game counts as finished this long after it starts
export const MAX_AGE_MS = 3 * 86400e3;        // the scores feed goes back 3 days

type LegRow = Leg & { odds_event_id?: string | null; sport_key?: string | null };
type PlayRow = Play & { legs: LegRow[] };
/** graded: settled from the final score · final: the game is final but the bet can't be read (props, names) · waiting: no final score yet */
export type GradeOutcome = "graded" | "final" | "waiting";
export interface GradeRun { checked: number; graded: number; left: number; error?: string; outcomes?: Record<string, GradeOutcome> }

/** upcoming: not started · live: still on the game list · over: the game ended · unknown: couldn't tell (props, no game time) */
export type GameStatus = "upcoming" | "live" | "over" | "unknown";

// The shortest a whole game takes. A game that leaves the list sooner than this is not called over
// (a feed hiccup, or postponed), and waits for the 3.5-hour fallback instead.
const MIN_LENGTH_MS: Record<string, number> = {
  baseball_mlb: 2 * 3600e3, americanfootball_nfl: 2.5 * 3600e3, americanfootball_ncaaf: 2.5 * 3600e3,
  basketball_nba: 1.75 * 3600e3, basketball_wnba: 1.5 * 3600e3, basketball_ncaab: 1.5 * 3600e3, icehockey_nhl: 2 * 3600e3,
};
const MIN_LENGTH_DEFAULT = 2 * 3600e3;
// About when a game usually ends: from here on, a followed game still on the list gets a final-score check
// (2 credits per sport, at most every 10 minutes), because the list is slow to drop finished games.
const TYPICAL_MS: Record<string, number> = {
  baseball_mlb: 2.25 * 3600e3, americanfootball_nfl: 2.9 * 3600e3, americanfootball_ncaaf: 3.1 * 3600e3,
  basketball_nba: 2.1 * 3600e3, basketball_wnba: 1.85 * 3600e3, basketball_ncaab: 1.85 * 3600e3, icehockey_nhl: 2.25 * 3600e3,
};
const LOOK_AHEAD_MS = 12 * 3600e3;

async function openPlays(db: any): Promise<PlayRow[]> {
  const { data, error } = await db.from("plays").select("*, legs(*)").eq("status", "open");
  if (error) throw error;
  return (data || []) as PlayRow[];
}

/** Where each open play's game stands, from the free game list: a game drops off the list once it's over.
 *  The first time a bet's game is found, its event id is saved on the legs so later checks know exactly
 *  which game it is (even after it has left the list). */
export async function checkGames(db: any, deps: {
  getGames: (sports: string) => Promise<{ events: GameRef[]; ok: string[] }>;
  toMs: (local: string) => number;
}): Promise<Map<string, GameStatus>> {
  const now = Date.now();
  const out = new Map<string, GameStatus>();
  type Pair = { play: PlayRow; legs: LegRow[]; start: number; id: string | null; sport: string | null };
  const pairs: Pair[] = [];
  const blind = new Set<string>();          // plays with a bet we can't follow (no game time)

  for (const p of await openPlays(db)) {
    if (!p.legs.length || waitingOnSecondLeg(p, p.legs)) continue;
    const seqs = Array.from(new Set(p.legs.filter(l => l.result === "pending").map(l => l.seq)));
    for (const q of seqs) {
      const legs = p.legs.filter(l => l.seq === q);
      const times = legs.filter(l => l.event_time).map(l => deps.toMs(l.event_time as string)).filter(t => !isNaN(t));
      if (!times.length) { blind.add(p.id); continue; }
      const start = Math.min(...times);
      if (now - start > MAX_AGE_MS) { blind.add(p.id); continue; }
      pairs.push({ play: p, legs, start, id: legs.find(l => l.odds_event_id)?.odds_event_id || null, sport: legs.find(l => l.sport_key)?.sport_key || null });
    }
  }
  // Only games that have started or start soon are worth a look.
  const watch = pairs.filter(x => x.start - now < LOOK_AHEAD_MS);
  const statuses = new Map<string, GameStatus[]>();
  const put = (id: string, s: GameStatus) => statuses.set(id, [...(statuses.get(id) || []), s]);
  pairs.filter(x => x.start - now >= LOOK_AHEAD_MS).forEach(x => put(x.play.id, "upcoming"));

  if (watch.length) {
    const sports = new Set(watch.map(x => x.sport || "auto"));
    const { events, ok } = await deps.getGames(Array.from(sports).join(","));
    const listed = new Map(events.map(e => [e.id, e]));
    const fetched = new Set(ok);
    const saves: PromiseLike<any>[] = [];

    for (const x of watch) {
      let id = x.id, sport = x.sport;
      if (!id) {
        const g = findGame(x.legs.find(l => l.side === "promo") || null, x.legs.find(l => l.side === "hedge") || null, events, x.start);
        if (g) {
          id = g.id; sport = g.sport_key;
          x.legs.filter(l => !l.odds_event_id).forEach(l => {
            l.odds_event_id = g.id; l.sport_key = g.sport_key;
            saves.push(db.from("legs").update({ odds_event_id: g.id, sport_key: g.sport_key }).eq("id", l.id).then(() => null, () => null));
          });
        }
      }
      let s: GameStatus = x.start > now ? "upcoming" : "unknown";
      if (id && listed.has(id)) s = Date.parse(listed.get(id)!.commence_time) <= now ? "live" : "upcoming";
      else if (id && sport && fetched.has(sport) && x.start <= now) {
        s = now - x.start >= (MIN_LENGTH_MS[sport] ?? MIN_LENGTH_DEFAULT) ? "over" : "live";
      }
      put(x.play.id, s);
    }
    await Promise.all(saves);
  }

  statuses.forEach((list, id) => {
    out.set(id, blind.has(id) ? "unknown"
      : list.includes("live") ? "live"
      : list.every(s => s === "over") ? "over"
      : list.includes("unknown") ? "unknown" : "upcoming");
  });
  return out;
}

/** Whether a play's game is done, so it needs a result. The game list decides when it knows: over means
 *  over, and a game still on the list is still going. Otherwise (props, bets we couldn't place on the
 *  list) the play counts as done 3.5 hours after its last start. A game still listed 6 hours after it
 *  started counts as done anyway, in case the list is slow to drop it. */
export function gameDone(status: GameStatus | undefined, sinceLastStart: number): boolean {
  if (status === "over") return true;
  if (status === "live" || status === "upcoming") return sinceLastStart > 6 * 3600e3;
  return sinceLastStart > GAME_LENGTH_MS;
}

/** When a play's last pending bet starts; else its first bet; else the end of the day it was placed. */
export function lastStartMs(p: PlayRow, toMs: (local: string) => number): number | null {
  const pending = p.legs.filter(l => l.result === "pending" && l.event_time).map(l => toMs(l.event_time as string));
  if (pending.length) return Math.max(...pending);
  const any = p.legs.map(l => l.event_time).filter(Boolean).map(s => toMs(s as string));
  if (any.length) return Math.min(...any);
  return p.placed_on ? toMs(`${p.placed_on}T23:59:00`) : null;
}

/** Open plays that need a result: what Today lists under Needs a result (and Money counts). */
export function needingResult<T extends PlayRow>(open: T[], status: Map<string, GameStatus> | null | undefined,
  toMs: (local: string) => number, now = Date.now()): T[] {
  return open.filter(p => {
    if (waitingOnSecondLeg(p, p.legs)) return false;
    const s = lastStartMs(p, toMs);
    return s != null && gameDone(status?.get(p.id), now - s);
  });
}

/** One grading pass, within the 3 days the scores feed covers. A play is tried when its game is done (see
 *  gameDone), or when it's a followed game that has run about a normal game's length; force tries every play
 *  whose game has started. status: from checkGames. shouldTry: lets the browser space out retries. */
export async function gradeOpenPlays(db: any, deps: {
  getEvents: (sports: string) => Promise<ScoreEvent[]>;   // comma list of sport keys, may include "auto"; completed games only
  toMs: (local: string) => number;                         // stored wall-clock time -> epoch ms
  today: string;                                           // settle date, YYYY-MM-DD
  status?: Map<string, GameStatus>;
  shouldTry?: (p: PlayRow) => boolean;
  force?: boolean;
}): Promise<GradeRun> {
  const data = await openPlays(db);
  const now = Date.now();
  const firstStart = (p: PlayRow) => {
    const t = p.legs.map(l => l.event_time).filter(Boolean).map(s => deps.toMs(s as string));
    return t.length ? Math.min(...t) : p.placed_on ? deps.toMs(`${p.placed_on}T23:59:00`) : null;
  };
  const due = data.filter(p => {
    if (!p.legs.length || waitingOnSecondLeg(p, p.legs)) return false;
    const pending = p.legs.filter(l => l.result === "pending" && l.event_time).map(l => deps.toMs(l.event_time as string));
    const times = pending.length ? pending : [firstStart(p)].filter((x): x is number => x != null);
    if (!times.length || now - Math.min(...times) >= MAX_AGE_MS) return false;
    const since = now - Math.max(...times);
    const st = deps.status?.get(p.id);
    const sport = p.legs.find(l => l.result === "pending" && l.odds_event_id && l.sport_key)?.sport_key;
    const ready = deps.force ? since > 0
      : gameDone(st, since) || (st === "live" && !!sport && since >= (TYPICAL_MS[sport] ?? GAME_LENGTH_MS));
    return ready && (deps.force || !deps.shouldTry || deps.shouldTry(p));
  });
  if (!due.length) return { checked: 0, graded: 0, left: 0, outcomes: {} };

  // Sports: saved on the bet (sent from Tools, or found on the game list); otherwise every in-season sport we grade.
  const known = new Set(due.flatMap(p => p.legs.map(l => l.sport_key).filter(Boolean) as string[]));
  const unknown = due.some(p => !p.legs.some(l => l.sport_key));
  const events = await deps.getEvents([...Array.from(known), ...(unknown ? ["auto"] : [])].join(","));

  const final = new Set(events.filter(e => e.completed).map(e => e.id));
  const outcomes: Record<string, GradeOutcome> = {};
  let graded = 0;
  for (const p of due) {
    const g = gradePlay(p, p.legs, events, deps.toMs);
    if (!g) {
      // Final but unreadable when every pending bet is tied to a game the feed has as final.
      const pending = p.legs.filter(l => l.result === "pending");
      outcomes[p.id] = pending.length && pending.every(l => l.odds_event_id && final.has(l.odds_event_id)) ? "final" : "waiting";
      continue;
    }
    const open = staysOpen(p, p.legs, g.winners);
    await settlePlayCore(db, p, p.legs, g.winners, { date: deps.today });
    const summary = open ? `First leg: ${g.summary} · risk-free, waiting on the second leg` : g.summary;
    await db.from("auto_grades").upsert({ play_id: p.id, client_id: p.client_id, summary, graded_at: new Date().toISOString() }, { onConflict: "play_id" });
    outcomes[p.id] = "graded";
    graded++;
  }
  return { checked: due.length, graded, left: due.length - graded, outcomes };
}
