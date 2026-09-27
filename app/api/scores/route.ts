import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Final scores for grading bets. Signed-in users only, cached so repeat checks don't spend credits.
// Each sport costs 2 Odds API credits per fetch (scores with daysFrom=3); the sports list is free.
export const dynamic = "force-dynamic";

const ALLOWED = new Set([
  "baseball_mlb", "americanfootball_nfl", "americanfootball_ncaaf", "basketball_nba", "basketball_wnba",
  "basketball_ncaab", "icehockey_nhl",
]);
const SCORES_TTL = 10 * 60 * 1000;
const SPORTS_TTL = 6 * 60 * 60 * 1000;
const scoreCache = new Map<string, { at: number; events: any[] }>();
let activeCache: { at: number; keys: string[] } | null = null;

async function signedIn(req: NextRequest) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !anon) return false;
  const { data, error } = await createClient(url, anon, { auth: { persistSession: false } }).auth.getUser(token);
  return !error && !!data?.user;
}

async function activeSports(key: string): Promise<string[]> {
  if (activeCache && Date.now() - activeCache.at < SPORTS_TTL) return activeCache.keys;
  const res = await fetch(`https://api.the-odds-api.com/v4/sports/?apiKey=${key}`, { cache: "no-store" });
  if (!res.ok) return Array.from(ALLOWED);
  const list = await res.json();
  const keys = (list || []).filter((s: any) => s.active && ALLOWED.has(s.key)).map((s: any) => s.key as string);
  activeCache = { at: Date.now(), keys };
  return keys;
}

export async function GET(req: NextRequest) {
  if (!(await signedIn(req))) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const key = process.env.ODDS_API_KEY;
  if (!key) return NextResponse.json({ error: "ODDS_API_KEY is not set" }, { status: 500 });

  const asked = (new URL(req.url).searchParams.get("sports") || "").split(",").map(s => s.trim()).filter(Boolean);
  const wanted = new Set(asked.filter(s => ALLOWED.has(s)));
  if (asked.includes("auto")) (await activeSports(key)).forEach(s => wanted.add(s));

  let remaining: string | null = null;
  const lists = await Promise.all(Array.from(wanted).slice(0, 8).map(async sport => {
    const hit = scoreCache.get(sport);
    if (hit && Date.now() - hit.at < SCORES_TTL) return hit.events;
    try {
      const res = await fetch(`https://api.the-odds-api.com/v4/sports/${sport}/scores/?daysFrom=3&dateFormat=iso&apiKey=${key}`, { cache: "no-store" });
      remaining = res.headers.get("x-requests-remaining") || remaining;
      if (!res.ok) return [];
      const data = await res.json();
      const events = (data || []).filter((e: any) => e.completed).map((e: any) => ({
        id: e.id, sport_key: e.sport_key, commence_time: e.commence_time, completed: !!e.completed,
        home_team: e.home_team, away_team: e.away_team, scores: e.scores || null,
      }));
      scoreCache.set(sport, { at: Date.now(), events });
      return events;
    } catch { return []; }
  }));
  return NextResponse.json({ events: lists.flat(), sports: Array.from(wanted), remaining });
}
