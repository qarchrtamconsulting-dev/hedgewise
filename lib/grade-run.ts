// One grading pass over open plays. Shared by the browser ("Check scores") and the scheduled server job.
import type { Leg, Play } from "@/lib/db";
import { gradePlay } from "@/lib/grade";
import type { ScoreEvent } from "@/lib/grade";
import { settlePlayCore, staysOpen, waitingOnSecondLeg } from "@/lib/settle-core";

export const GAME_LENGTH_MS = 3.5 * 3600e3;   // a game counts as finished this long after it starts
export const MAX_AGE_MS = 3 * 86400e3;        // the scores feed goes back 3 days

type PlayRow = Play & { legs: (Leg & { odds_event_id?: string | null; sport_key?: string | null })[] };
export interface GradeRun { checked: number; graded: number; left: number; error?: string }

export async function gradeOpenPlays(db: any, deps: {
  getEvents: (sports: string) => Promise<ScoreEvent[]>;   // comma list of sport keys, may include "auto"
  toMs: (local: string) => number;                         // stored wall-clock time -> epoch ms
  today: string;                                           // settle date, YYYY-MM-DD
}): Promise<GradeRun> {
  const { data, error } = await db.from("plays").select("*, legs(*)").eq("status", "open");
  if (error) throw error;
  const now = Date.now();
  const firstStart = (p: PlayRow) => {
    const t = p.legs.map(l => l.event_time).filter(Boolean).map(s => deps.toMs(s as string));
    return t.length ? Math.min(...t) : p.placed_on ? deps.toMs(`${p.placed_on}T23:59:00`) : null;
  };
  // Due: every pair still waiting on a result has finished, within the 3 days the scores feed covers.
  const due = ((data || []) as PlayRow[]).filter(p => {
    if (!p.legs.length || waitingOnSecondLeg(p, p.legs)) return false;
    const pending = p.legs.filter(l => l.result === "pending" && l.event_time).map(l => deps.toMs(l.event_time as string));
    const times = pending.length ? pending : [firstStart(p)].filter((x): x is number => x != null);
    if (!times.length) return false;
    return now - Math.max(...times) > GAME_LENGTH_MS && now - Math.min(...times) < MAX_AGE_MS;
  });
  if (!due.length) return { checked: 0, graded: 0, left: 0 };

  // Sports: saved on bets sent from Tools; otherwise every in-season sport we grade.
  const known = new Set(due.flatMap(p => p.legs.map(l => l.sport_key).filter(Boolean) as string[]));
  const unknown = due.some(p => !p.legs.some(l => l.sport_key));
  const events = await deps.getEvents([...Array.from(known), ...(unknown ? ["auto"] : [])].join(","));

  let graded = 0;
  for (const p of due) {
    const g = gradePlay(p, p.legs, events, deps.toMs);
    if (!g) continue;
    const open = staysOpen(p, p.legs, g.winners);
    await settlePlayCore(db, p, p.legs, g.winners, { date: deps.today });
    const summary = open ? `First leg: ${g.summary} · risk-free, waiting on the second leg` : g.summary;
    await db.from("auto_grades").upsert({ play_id: p.id, client_id: p.client_id, summary, graded_at: new Date().toISOString() }, { onConflict: "play_id" });
    graded++;
  }
  return { checked: due.length, graded, left: due.length - graded };
}
