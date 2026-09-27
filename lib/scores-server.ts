// Server only: final scores from The Odds API, cached per sport. 2 credits per sport per fetch; the sports list is free.
import type { ScoreEvent } from "@/lib/grade";

export const SCORE_SPORTS = new Set([
  "baseball_mlb", "americanfootball_nfl", "americanfootball_ncaaf", "basketball_nba", "basketball_wnba",
  "basketball_ncaab", "icehockey_nhl",
]);
const SCORES_TTL = 10 * 60 * 1000;
const SPORTS_TTL = 6 * 60 * 60 * 1000;
const scoreCache = new Map<string, { at: number; events: ScoreEvent[] }>();
let activeCache: { at: number; keys: string[] } | null = null;

async function activeSports(key: string): Promise<string[]> {
  if (activeCache && Date.now() - activeCache.at < SPORTS_TTL) return activeCache.keys;
  const res = await fetch(`https://api.the-odds-api.com/v4/sports/?apiKey=${key}`, { cache: "no-store" });
  if (!res.ok) return Array.from(SCORE_SPORTS);
  const list = await res.json();
  const keys = (list || []).filter((s: any) => s.active && SCORE_SPORTS.has(s.key)).map((s: any) => s.key as string);
  activeCache = { at: Date.now(), keys };
  return keys;
}

/** sports: sport keys, and/or "auto" for every in-season sport we grade. */
export async function getScores(sports: string[], key: string): Promise<{ events: ScoreEvent[]; sports: string[]; remaining: string | null }> {
  const wanted = new Set(sports.filter(s => SCORE_SPORTS.has(s)));
  if (sports.includes("auto")) (await activeSports(key)).forEach(s => wanted.add(s));
  let remaining: string | null = null;
  const lists = await Promise.all(Array.from(wanted).slice(0, 8).map(async sport => {
    const hit = scoreCache.get(sport);
    if (hit && Date.now() - hit.at < SCORES_TTL) return hit.events;
    try {
      const res = await fetch(`https://api.the-odds-api.com/v4/sports/${sport}/scores/?daysFrom=3&dateFormat=iso&apiKey=${key}`, { cache: "no-store" });
      remaining = res.headers.get("x-requests-remaining") || remaining;
      if (!res.ok) return [];
      const data = await res.json();
      const events: ScoreEvent[] = (data || []).filter((e: any) => e.completed).map((e: any) => ({
        id: e.id, sport_key: e.sport_key, commence_time: e.commence_time, completed: !!e.completed,
        home_team: e.home_team, away_team: e.away_team, scores: e.scores || null,
      }));
      scoreCache.set(sport, { at: Date.now(), events });
      return events;
    } catch { return []; }
  }));
  return { events: lists.flat(), sports: Array.from(wanted), remaining };
}
