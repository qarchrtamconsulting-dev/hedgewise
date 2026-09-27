import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkGames, gradeOpenPlays } from "@/lib/grade-run";
import { getGames, getScores } from "@/lib/scores-server";
import { todayIn, zonedToMs } from "@/lib/tz";

// Scheduled grading (vercel.json: around 6 PM, midnight and 6 AM Eastern). Vercel calls this with
// "Authorization: Bearer <CRON_SECRET>". It saves results with the Supabase service key, so it runs
// with nobody signed in.
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const TZ = "America/New_York";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, service = process.env.SUPABASE_SERVICE_ROLE_KEY, odds = process.env.ODDS_API_KEY;
  if (!url || !service) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set in Vercel" }, { status: 500 });
  if (!odds) return NextResponse.json({ error: "ODDS_API_KEY is not set" }, { status: 500 });

  const db = createClient(url, service, { auth: { persistSession: false } });
  try {
    const toMs = (local: string) => zonedToMs(local, TZ);
    // Which games have ended (free), then final scores for those.
    const status = await checkGames(db, { getGames: sports => getGames(sports.split(","), odds), toMs }).catch(() => undefined);
    const run = await gradeOpenPlays(db, {
      getEvents: async sports => (await getScores(sports.split(","), odds)).events,
      toMs,
      today: todayIn(TZ),
      status,
    });
    await db.from("app_settings").upsert({ key: "grading_last_run", value: new Date().toISOString() }, { onConflict: "key" });
    return NextResponse.json({ ok: true, ...run });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Grading failed" }, { status: 500 });
  }
}
