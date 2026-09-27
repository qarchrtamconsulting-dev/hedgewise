import { NextResponse } from "next/server";

// TEMPORARY: checks that the Odds API events list is free and lists games in progress. Returns only public
// game info and credit counters. Remove after checking.
export const dynamic = "force-dynamic";

export async function GET() {
  const key = process.env.ODDS_API_KEY;
  if (!key) return NextResponse.json({ error: "no key" }, { status: 500 });
  const until = new Date(Date.now() + 2 * 86400e3).toISOString().slice(0, 19) + "Z";
  const hit = async (sport: string, extra = "") => {
    const res = await fetch(`https://api.the-odds-api.com/v4/sports/${sport}/events?dateFormat=iso${extra}&apiKey=${key}`, { cache: "no-store" });
    const body = await res.json().catch(() => null);
    return { status: res.status, used: res.headers.get("x-requests-used"), remaining: res.headers.get("x-requests-remaining"), last: res.headers.get("x-requests-last"), body };
  };
  const a = await hit("baseball_mlb");
  const b = await hit("baseball_mlb", `&commenceTimeTo=${until}`);
  const c = await hit("americanfootball_ncaaf", `&commenceTimeTo=${until}`);
  // One scores pull (2 credits) to compare: is the finished game marked completed there yet?
  const sc = await fetch(`https://api.the-odds-api.com/v4/sports/baseball_mlb/scores/?daysFrom=1&dateFormat=iso&apiKey=${key}`, { cache: "no-store" });
  const scBody = await sc.json().catch(() => []);
  const scores = (Array.isArray(scBody) ? scBody : []).filter((e: any) => Date.parse(e.commence_time) > Date.now() - 6 * 3600e3 && Date.parse(e.commence_time) < Date.now())
    .map((e: any) => `${e.away_team} @ ${e.home_team} · completed=${e.completed} · last_update=${e.last_update} · ${JSON.stringify(e.scores)}`);
  const now = Date.now();
  const list = (x: any) => (Array.isArray(x.body) ? x.body : []);
  return NextResponse.json({
    at: new Date().toISOString(),
    calls: [a, b, c].map(x => ({ status: x.status, used: x.used, remaining: x.remaining, last: x.last, count: list(x).length, error: Array.isArray(x.body) ? null : x.body })),
    mlbStarted: list(a).filter((e: any) => Date.parse(e.commence_time) <= now).map((e: any) => `${e.away_team} @ ${e.home_team} · ${e.commence_time} · ${e.id}`),
    scoresLast: sc.headers.get("x-requests-last"),
    scores,
    mlbNext: list(a).filter((e: any) => Date.parse(e.commence_time) > now).slice(0, 3).map((e: any) => `${e.away_team} @ ${e.home_team} · ${e.commence_time}`),
  });
}
