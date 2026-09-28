"use client";
import { useRef, useState } from "react";
import { BOOK_MAP, LEAGUE_SPORT, toDec, mkHold } from "@/lib/constants";

export type Family = "ml" | "spread" | "total";

export interface FinderGame {
  /** The Odds API event id (used to grade the bet from the final score). */
  id: string;
  /** Unique per card: one game can show several lines. */
  key: string;
  home: string; away: string;
  commence: string;
  /** Moneyline, spread or total, and the label shown on the card ("Alt spread", "Total", ...). */
  family: Family;
  market: string;
  /** The selections as they're bet: "Chicago Bears", "Chicago Bears +3.5", "Over 45.5". */
  fixedTeam: string;
  hedgeTeam: string;
  fixedDecimal: number;
  hedgeDecimal: number;
  fixedAmerican: string;
  hedgeAmerican: string;
  hedgeBookName: string;
  hedgeBookKey: string;
  fixedBookKey: string;
  /** When the feed last saw each book's price move (ISO), and when we last checked this line. */
  fixedAt?: string;
  hedgeAt?: string;
  checkedAt: number;
  hold: number;
  fixedLink?: string;
  hedgeLink?: string;
  league?: string;
}

export const MARKETS = ["Moneyline", "Spreads", "Totals", "Alt spreads", "Alt totals"];
const MARKET_KEY: Record<string, string> = {
  Moneyline: "h2h", Spreads: "spreads", Totals: "totals", "Alt spreads": "alternate_spreads", "Alt totals": "alternate_totals",
};
const FEATURED = new Set(["h2h", "spreads", "totals"]);

export interface FinderConfig {
  fixedBook: string;
  leagues: string[];
  hedgeBooks: string[];
  fixedMinAmerican: string;
  fixedMaxAmerican: string;
  hideLive: boolean;
  /** Only games starting today (Eastern). Missing = on, so older saved presets get it too. */
  todayOnly?: boolean;
  /** Which lines to search. Missing = Moneyline only, so older presets behave as before. */
  markets?: string[];
}

export const marketsOf = (cfg: FinderConfig) => (cfg.markets && cfg.markets.length ? cfg.markets : ["Moneyline"]);

const pt = (p: number) => (p > 0 ? `+${p}` : p === 0 ? "+0" : `${p}`);

/** Runs fn over items, a few at a time. */
async function pool<T>(items: T[], size: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  const run = async () => { while (i < items.length) { const x = items[i++]; await fn(x); } };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, run));
}

/** price = exact decimal worked out from the book's American odds; am = those American odds as the book shows them. */
type Price = { price: number; am: number; link?: string; alt: boolean; at?: string };
const amText = (am: number) => (am > 0 ? `+${am}` : `${am}`);
type Sel = { label: string; family: Family; name: string; point: number | null; books: Record<string, Price> };

/** Every selection on a game, grouped so each one can be paired with its exact opposite. */
function selections(game: any): Map<string, Sel> {
  const out = new Map<string, Sel>();
  for (const bm of game.bookmakers || []) {
    for (const m of bm.markets || []) {
      const family: Family = m.key === "h2h" ? "ml" : m.key.includes("spread") ? "spread" : "total";
      const alt = m.key.startsWith("alternate");
      for (const o of m.outcomes || []) {
        const point = typeof o.point === "number" ? o.point : null;
        if (family !== "ml" && point == null) continue;
        // The feed sends American odds (decimal odds come rounded to 2 places, which moved lines by a few points).
        const am = Math.round(Number(o.price));
        const dec = toDec(am);
        if (!dec || !(dec > 1.01)) continue;   // dead or off-the-board lines break the math
        const label = family === "ml" ? o.name : family === "spread" ? `${o.name} ${pt(point!)}` : `${o.name} ${point}`;
        const k = `${family}|${label}`;
        if (!out.has(k)) out.set(k, { label, family, name: o.name, point, books: {} });
        const s = out.get(k)!;
        const prev = s.books[bm.key];
        // The main line wins over the same line listed again under alternates.
        if (!prev || (prev.alt && !alt) || (prev.alt === alt && dec > prev.price)) {
          s.books[bm.key] = { price: dec, am, link: o.link || bm.link, alt, at: m.last_update || bm.last_update };
        }
      }
    }
  }
  return out;
}

function oppositeKey(s: Sel, game: any): string | null {
  if (s.family === "ml") {
    const other = s.name === game.home_team ? game.away_team : s.name === game.away_team ? game.home_team : null;
    return other ? `ml|${other}` : null;
  }
  if (s.family === "spread") {
    const other = s.name === game.home_team ? game.away_team : s.name === game.away_team ? game.home_team : null;
    return other ? `spread|${other} ${pt(-(s.point as number))}` : null;
  }
  const flip = s.name === "Over" ? "Under" : s.name === "Under" ? "Over" : null;
  return flip ? `total|${flip} ${s.point}` : null;
}

/** One card: this selection at the fixed book against the best opposite price among the hedge books. */
function buildGame(game: any, s: Sel, sels: Map<string, Sel>, fk: string, hks: string[], checkedAt: number): FinderGame | null {
  const fixed = s.books[fk];
  if (!fixed) return null;
  const ok = oppositeKey(s, game);
  const opp = ok ? sels.get(ok) : undefined;
  if (!opp) return null;
  const hedgeOpts = hks.map(k => ({ k, side: opp.books[k] })).filter(x => x.side);
  if (!hedgeOpts.length) return null;
  const best = hedgeOpts.reduce((a, b) => (b.side!.price > a.side!.price ? b : a));
  const market = s.family === "ml" ? "Moneyline" : `${fixed.alt || best.side!.alt ? "Alt " : ""}${s.family === "spread" ? "spread" : "total"}`;
  return {
    id: game.id,
    key: `${game.id}|${s.family}|${s.label}`,
    home: game.home_team, away: game.away_team,
    commence: game.commence_time,
    family: s.family,
    market: market.charAt(0).toUpperCase() + market.slice(1),
    fixedTeam: s.label, hedgeTeam: opp.label,
    fixedDecimal: fixed.price, hedgeDecimal: best.side!.price,
    fixedAmerican: amText(fixed.am), hedgeAmerican: amText(best.side!.am),
    hedgeBookName: BOOK_MAP[best.k] || best.k,
    hedgeBookKey: best.k,
    fixedBookKey: fk,
    fixedAt: fixed.at, hedgeAt: best.side!.at, checkedAt,
    hold: mkHold(fixed.price, best.side!.price),
    fixedLink: fixed.link, hedgeLink: best.side!.link,
    league: Object.entries(LEAGUE_SPORT).find(([, v]) => v === game.sport_key)?.[0],
  };
}

export type Recheck = { status: "same" | "moved" | "gone" | "error"; note: string };

// Finds games where the FIXED book has odds in your range and the HEDGE book has the best
// price on the exact opposite side (same line for spreads and totals). Sorted by hold.
export function useGameFinder() {
  const [games, setGames] = useState<FinderGame[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updated, setUpdated] = useState<string | null>(null);
  const [callsLeft, setCallsLeft] = useState<string | null>(null);
  const [cached, setCached] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const books = useRef<{ fk: string; hks: string[] } | null>(null);

  const fetchGames = async (cfg: FinderConfig) => {
    const mk = marketsOf(cfg).map(m => MARKET_KEY[m]).filter(Boolean);
    if (!cfg.fixedBook || !cfg.leagues.length || !cfg.hedgeBooks.length || !mk.length) {
      setError("Pick a Fixed Book, at least one League, at least one Hedge Book, and a market.");
      return;
    }
    setLoading(true); setError(null); setGames([]);

    const fk = Object.entries(BOOK_MAP).find(([, v]) => v === cfg.fixedBook)?.[0];
    const hks = cfg.hedgeBooks.map(b => Object.entries(BOOK_MAP).find(([, v]) => v === b)?.[0]).filter(Boolean) as string[];
    const allKeys = [...new Set([fk, ...hks])].filter(Boolean) as string[];
    books.current = { fk: fk!, hks };
    const sports = [...new Set(cfg.leagues.map(l => LEAGUE_SPORT[l]).filter(Boolean))];
    const minD = toDec(cfg.fixedMinAmerican);
    const maxD = toDec(cfg.fixedMaxAmerican);
    const featured = mk.filter(k => FEATURED.has(k));
    const alternates = mk.filter(k => !FEATURED.has(k));
    const now = new Date();
    const etDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
    const today = etDay(now);
    const todayOnly = cfg.todayOnly !== false;
    const keep = (iso: string) => {
      const d = new Date(iso);
      if (cfg.hideLive && d <= now) return false;
      if (todayOnly && etDay(d) !== today) return false;
      return true;
    };
    let raw: any[] = [];
    let anyCached = false;
    const note = (j: any) => { if (j.remaining) setCallsLeft(j.remaining); if (j.cached) anyCached = true; };

    for (const sport of sports) {
      try {
        let events: any[] = [];
        if (featured.length) {
          const j = await (await fetch(`/api/odds?sport=${sport}&bookmakers=${allKeys.join(",")}&markets=${featured.join(",")}`)).json();
          note(j);
          if (j.error) { setError(j.error); continue; }
          events = j.data || [];
        } else {
          const j = await (await fetch(`/api/odds?sport=${sport}&list=1`)).json();
          if (j.error) { setError(j.error); continue; }
          events = (j.data || []).map((e: any) => ({ ...e, bookmakers: [] }));
        }
        events = events.filter(e => keep(e.commence_time));

        if (alternates.length) {
          await pool(events, 4, async (ev) => {
            try {
              const j = await (await fetch(`/api/odds?sport=${sport}&bookmakers=${allKeys.join(",")}&markets=${alternates.join(",")}&event=${ev.id}`)).json();
              note(j);
              if (j.error) { setError(j.error); return; }
              for (const bm of j.data?.bookmakers || []) {
                const mine = ev.bookmakers.find((b: any) => b.key === bm.key);
                if (mine) mine.markets = [...(mine.markets || []), ...(bm.markets || [])];
                else ev.bookmakers.push(bm);
              }
            } catch (e: any) { setError(e.message); }
          });
        }
        raw = [...raw, ...events];
      } catch (e: any) {
        setError(e.message);
      }
    }

    const results: FinderGame[] = [];
    const at = Date.now();
    for (const game of raw) {
      const sels = selections(game);
      for (const s of sels.values()) {
        const fixed = s.books[fk!];
        if (!fixed) continue;
        if (minD && fixed.price < minD) continue;
        if (maxD && fixed.price > maxD) continue;
        const g = buildGame(game, s, sels, fk!, hks, at);
        if (g) results.push(g);
      }
    }

    setGames(results.sort((a, b) => a.hold - b.hold));
    setUpdated(new Date().toLocaleTimeString());
    setUpdatedAt(Date.now());
    setCached(anyCached);
    setLoading(false);
  };

  /** Re-prices one card from a fresh pull of just that game (about 1 credit per market). */
  const recheck = async (key: string): Promise<Recheck> => {
    const g = games.find(x => x.key === key);
    const bk = books.current;
    const sport = g?.league ? LEAGUE_SPORT[g.league] : null;
    if (!g || !bk || !sport) return { status: "error", note: "Couldn't recheck this line." };
    const markets = g.family === "ml" ? ["h2h"]
      : g.family === "spread" ? (g.market.startsWith("Alt") ? ["spreads", "alternate_spreads"] : ["spreads"])
      : (g.market.startsWith("Alt") ? ["totals", "alternate_totals"] : ["totals"]);
    const keys = [...new Set([bk.fk, ...bk.hks])];
    try {
      const j = await (await fetch(`/api/odds?sport=${sport}&bookmakers=${keys.join(",")}&markets=${markets.join(",")}&event=${g.id}&fresh=${Date.now()}`)).json();
      if (j.remaining) setCallsLeft(j.remaining);
      if (j.error || !j.data) return { status: "error", note: j.error ? `Couldn't recheck: ${j.error}` : "Couldn't recheck this line." };
      const sels = selections(j.data);
      const s = sels.get(`${g.family}|${g.fixedTeam}`);
      const next = s ? buildGame(j.data, s, sels, bk.fk, bk.hks, Date.now()) : null;
      if (!next) {
        setGames(gs => gs.map(x => (x.key === key ? { ...x, checkedAt: Date.now() } : x)));
        return { status: "gone", note: `${g.fixedTeam} isn't listed at your book right now, or no hedge is left. Pick another game.` };
      }
      setGames(gs => gs.map(x => (x.key === key ? next : x)));
      const moved = next.fixedAmerican !== g.fixedAmerican || next.hedgeAmerican !== g.hedgeAmerican || next.hedgeBookKey !== g.hedgeBookKey;
      return moved
        ? { status: "moved", note: `Line moved: ${g.fixedAmerican} → ${next.fixedAmerican}, hedge ${g.hedgeBookName} ${g.hedgeAmerican} → ${next.hedgeBookName} ${next.hedgeAmerican}. Stakes updated.` }
        : { status: "same", note: "Line checked just now: no change." };
    } catch (e: any) {
      return { status: "error", note: `Couldn't recheck: ${e?.message || "network error"}` };
    }
  };

  return { games, loading, error, updated, updatedAt, callsLeft, cached, fetchGames, recheck };
}
