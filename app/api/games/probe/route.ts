import { NextResponse } from "next/server";
import { checkGames } from "@/lib/grade-run";
import { gradePlay } from "@/lib/grade";
import { getGames, getScores } from "@/lib/scores-server";
import { zonedToMs } from "@/lib/tz";

// TEMPORARY dry run of the server path on a made-up bet (no client data, nothing saved): finds the game on
// the free list, reports its status, and with ?scores=1 (2 credits) tries grading it. Remove after checking.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const key = process.env.ODDS_API_KEY;
  if (!key) return NextResponse.json({ error: "no key" }, { status: 500 });
  const withScores = new URL(req.url).searchParams.get("scores") === "1";
  const legs = [
    { id: "a", seq: 1, side: "promo", selection: "athletics ml", event_time: "2026-09-26T21:40:00", result: "pending", odds_event_id: null, sport_key: null },
    { id: "b", seq: 1, side: "hedge", selection: "astros ml", event_time: "2026-09-26T21:40:00", result: "pending", odds_event_id: null, sport_key: null },
  ];
  const play = { id: "demo", client_id: "demo", promo: "demo", promo_type: "Other", status: "open", placed_on: "2026-09-26", legs };
  const saved: any[] = [];
  const db = {
    from: (t: string) => {
      const q: any = {
        v: null, select: () => q, update: (v: any) => { q.v = v; return q; },
        eq: (c: string, x: any) => { if (q.v) saved.push({ t, ...q.v, [c]: x }); return q; },
        then: (res: any, rej: any) => Promise.resolve(q.v ? { error: null } : { data: [play], error: null }).then(res, rej),
      };
      return q;
    },
  };
  const toMs = (l: string) => zonedToMs(l, "America/New_York");
  const status = await checkGames(db, { getGames: s => getGames(s.split(","), key), toMs });
  const grade = withScores ? gradePlay(play as any, legs as any, (await getScores(["baseball_mlb"], key)).events, toMs) : "not asked";
  return NextResponse.json({ at: new Date().toISOString(), status: Object.fromEntries(status), saved, grade });
}
