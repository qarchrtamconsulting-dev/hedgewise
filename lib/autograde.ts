"use client";
import { getDb, today } from "@/lib/db";
import { gradeOpenPlays } from "@/lib/grade-run";
import type { GradeRun } from "@/lib/grade-run";

// Browser grading: "Check scores" on Today, plus a fallback while the scheduled server checks
// (6 PM, midnight, 6 AM) aren't running yet.

const LAST_RUN = "hw-grade-at";
const EVERY_MS = 15 * 60 * 1000;
const SERVER_FRESH_MS = 13 * 3600e3;     // a server check this recent means the schedule is working
export const GRADED_EVENT = "hw-graded";
export type { GradeRun } from "@/lib/grade-run";

let running = false;

/** When the scheduled server check last ran (ISO), if ever. */
export async function lastScheduledCheck(): Promise<string | null> {
  try {
    const db = await getDb();
    const { data } = await db.from("app_settings").select("value").eq("key", "grading_last_run").maybeSingle();
    return (data as any)?.value || null;
  } catch { return null; }
}

export async function autoGrade(force = false): Promise<GradeRun | null> {
  if (running) return null;
  if (!force) {
    const last = await lastScheduledCheck();
    if (last && Date.now() - Date.parse(last) < SERVER_FRESH_MS) return null;   // the server schedule has it
    try {
      if (Date.now() - Number(localStorage.getItem(LAST_RUN) || 0) < EVERY_MS) return null;
      localStorage.setItem(LAST_RUN, String(Date.now()));
    } catch {}
  }
  running = true;
  try {
    const db = await getDb();
    const run = await gradeOpenPlays(db, {
      getEvents: async sports => {
        const { data: sess } = await db.auth.getSession();
        const res = await fetch(`/api/scores?sports=${encodeURIComponent(sports)}`, {
          headers: sess.session ? { Authorization: `Bearer ${sess.session.access_token}` } : {},
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.error || `Scores ${res.status}`);
        return body.events || [];
      },
      toMs: local => new Date(local).getTime(),
      today: today(),
    });
    if (run.graded) window.dispatchEvent(new Event(GRADED_EVENT));
    return run;
  } catch (e: any) {
    return { checked: 0, graded: 0, left: 0, error: e?.message || "Couldn't check scores" };
  } finally {
    running = false;
  }
}
