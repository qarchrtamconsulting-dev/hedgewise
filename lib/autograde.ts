"use client";
import { getDb, today } from "@/lib/db";
import { checkGames, gradeOpenPlays } from "@/lib/grade-run";
import type { GameStatus, GradeRun } from "@/lib/grade-run";

// Browser side, while Hedgewise is open: follows open bets' games on the free game list and grades a play
// from the final score once its game ends. The scheduled server checks (6 PM, midnight, 6 AM) cover the
// hours nobody has it open. "Check scores" on Today forces a pass.
//
// Credits: the game list is free. A final-score check is 2 credits per sport, asked only once a game has
// run about a normal game's length (or has ended), at most every 10 minutes per play. It stops for a play
// once its game is final (graded, or left for you when the bet can't be read), or after enough tries.

export const GRADED_EVENT = "hw-graded";
export const GAMES_EVENT = "hw-games";
export type { GameStatus, GradeRun } from "@/lib/grade-run";

const TRIES = "hw-grade-tries";          // play id -> automatic final-score checks so far
const RETRY_MS = 10 * 60e3;
const MAX_FOLLOWED = 30;                 // a game we follow by id: about 5 hours of checks
const MAX_UNFOLLOWED = 4;                // a bet we couldn't find on the game list (names, props): 4 checks
type Tries = Record<string, { n: number; at: number; stop?: boolean }>;

let running = false;
let games: { at: number; status: Map<string, GameStatus> } | null = null;
let checking: Promise<Map<string, GameStatus> | null> | null = null;

const toMs = (local: string) => new Date(local).getTime();

async function getJson(db: any, url: string) {
  const { data } = await db.auth.getSession();
  const res = await fetch(url, { headers: data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {} });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Error ${res.status}`);
  return body;
}

function readTries(): Tries {
  try { return JSON.parse(localStorage.getItem(TRIES) || "{}") || {}; } catch { return {}; }
}
function writeTries(t: Tries) {
  try { localStorage.setItem(TRIES, JSON.stringify(t)); } catch {}
}

/** The latest game check, or null before the first one finishes. */
export function lastGames() { return games; }

/** Where open bets' games stand (free). Callers asking at the same time share one check. */
export function refreshGames(): Promise<Map<string, GameStatus> | null> {
  if (checking) return checking;
  checking = (async () => {
    try {
      const db = await getDb();
      const status = await checkGames(db, { getGames: sports => getJson(db, `/api/games?sports=${encodeURIComponent(sports)}`), toMs });
      const tries = readTries();
      status.forEach((_, id) => { if (tries[id]?.stop) status.set(id, "over"); });   // final, but needs you
      games = { at: Date.now(), status };
      window.dispatchEvent(new Event(GAMES_EVENT));
      return status;
    } catch {
      return null;
    } finally {
      checking = null;
    }
  })();
  return checking;
}

/** When the scheduled server check last ran (ISO), if ever. */
export async function lastScheduledCheck(): Promise<string | null> {
  try {
    const db = await getDb();
    const { data } = await db.from("app_settings").select("value").eq("key", "grading_last_run").maybeSingle();
    return (data as any)?.value || null;
  } catch { return null; }
}

/** Check the games, then grade plays whose games are done or about done. force (Check scores) tries
 *  every open bet whose game has started. */
export async function autoGrade(force = false): Promise<GradeRun | null> {
  if (running) return null;
  running = true;
  try {
    const db = await getDb();
    const status = (await refreshGames()) || undefined;
    const tries = readTries();
    const now = Date.now();
    const run = await gradeOpenPlays(db, {
      getEvents: async sports => (await getJson(db, `/api/scores?sports=${encodeURIComponent(sports)}`)).events || [],
      toMs, today: today(), status, force,
      shouldTry: p => {
        const t = tries[p.id];
        if (!t) return true;
        const followed = p.legs.some(l => l.result === "pending" && l.odds_event_id);
        return !t.stop && now - t.at >= RETRY_MS && t.n < (followed ? MAX_FOLLOWED : MAX_UNFOLLOWED);
      },
    });
    const finalNow: string[] = [];
    for (const [id, o] of Object.entries(run.outcomes || {})) {
      if (o === "graded") { delete tries[id]; continue; }
      tries[id] = { n: (tries[id]?.n || 0) + 1, at: now, stop: o === "final" };
      if (o === "final") finalNow.push(id);
    }
    for (const id of Object.keys(tries)) if (now - tries[id].at > 3 * 86400e3) delete tries[id];
    writeTries(tries);
    // A final game the bet can't be read from goes to Needs a result right away.
    if (games && finalNow.some(id => games!.status.get(id) !== "over")) {
      const next = new Map(games.status);
      finalNow.forEach(id => next.set(id, "over"));
      games = { at: games.at, status: next };
      window.dispatchEvent(new Event(GAMES_EVENT));
    }
    if (run.graded) window.dispatchEvent(new Event(GRADED_EVENT));
    return run;
  } catch (e: any) {
    return { checked: 0, graded: 0, left: 0, error: e?.message || "Couldn't check scores" };
  } finally {
    running = false;
  }
}
