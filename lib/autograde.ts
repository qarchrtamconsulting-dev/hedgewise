"use client";
import { Leg, Play, getDb } from "@/lib/db";
import { settlePlay, staysOpen, waitingOnSecondLeg } from "@/lib/settle";
import { gradePlay } from "@/lib/grade";
import type { ScoreEvent } from "@/lib/grade";

// Checks finished games against open plays and settles the ones it can match with confidence.
// Runs when any page opens (at most every 15 minutes per device) and from "Check scores" on Today.

const LAST_RUN = "hw-grade-at";
const EVERY_MS = 15 * 60 * 1000;
const GAME_LENGTH_MS = 3.5 * 3600e3;     // a game counts as finished this long after it starts
const MAX_AGE_MS = 3 * 86400e3;          // the scores feed goes back 3 days
export const GRADED_EVENT = "hw-graded";

type PlayRow = Play & { legs: (Leg & { odds_event_id?: string | null; sport_key?: string | null })[] };
export interface GradeRun { checked: number; graded: number; left: number; error?: string }

const startMs = (p: PlayRow) => {
  const t = p.legs.map(l => l.event_time).filter(Boolean).map(s => new Date(s as string).getTime());
  return t.length ? Math.min(...t) : p.placed_on ? new Date(`${p.placed_on}T23:59:00`).getTime() : null;
};

let running = false;

export async function autoGrade(force = false): Promise<GradeRun | null> {
  if (running) return null;
  try {
    if (!force && Date.now() - Number(localStorage.getItem(LAST_RUN) || 0) < EVERY_MS) return null;
    localStorage.setItem(LAST_RUN, String(Date.now()));
  } catch {}
  running = true;
  try {
    const db = await getDb();
    const { data, error } = await db.from("plays").select("*, legs(*)").eq("status", "open");
    if (error) throw error;
    const now = Date.now();
    // Due: every pair still waiting on a result has finished, within the 3 days the scores feed covers.
    const due = ((data || []) as PlayRow[]).filter(p => {
      if (!p.legs.length || waitingOnSecondLeg(p, p.legs)) return false;
      const pending = p.legs.filter(l => l.result === "pending" && l.event_time).map(l => new Date(l.event_time as string).getTime());
      const times = pending.length ? pending : [startMs(p)].filter((x): x is number => x != null);
      if (!times.length) return false;
      return now - Math.max(...times) > GAME_LENGTH_MS && now - Math.min(...times) < MAX_AGE_MS;
    });
    if (!due.length) return { checked: 0, graded: 0, left: 0 };

    // Sports: saved on bets sent from Tools; otherwise every in-season sport we grade.
    const known = new Set(due.flatMap(p => p.legs.map(l => l.sport_key).filter(Boolean) as string[]));
    const unknown = due.some(p => !p.legs.some(l => l.sport_key));
    const sports = [...Array.from(known), ...(unknown ? ["auto"] : [])].join(",");
    const { data: sess } = await db.auth.getSession();
    const res = await fetch(`/api/scores?sports=${encodeURIComponent(sports)}`, {
      headers: sess.session ? { Authorization: `Bearer ${sess.session.access_token}` } : {},
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { checked: due.length, graded: 0, left: due.length, error: body?.error || `Scores ${res.status}` };
    const events: ScoreEvent[] = body.events || [];

    let graded = 0;
    for (const p of due) {
      const g = gradePlay(p, p.legs, events, local => new Date(local).getTime());
      if (!g) continue;
      const open = staysOpen(p, p.legs, g.winners);
      await settlePlay(db, p, p.legs, g.winners);
      const summary = open ? `First leg: ${g.summary} · risk-free, waiting on the second leg` : g.summary;
      await db.from("auto_grades").upsert({ play_id: p.id, client_id: p.client_id, summary, graded_at: new Date().toISOString() }, { onConflict: "play_id" });
      graded++;
    }
    if (graded) window.dispatchEvent(new Event(GRADED_EVENT));
    return { checked: due.length, graded, left: due.length - graded };
  } catch (e: any) {
    return { checked: 0, graded: 0, left: 0, error: e?.message || "Couldn't check scores" };
  } finally {
    running = false;
  }
}
