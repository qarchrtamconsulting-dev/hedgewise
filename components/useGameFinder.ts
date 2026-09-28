"use client";
import { useState } from "react";
import { BOOK_MAP, LEAGUE_SPORT, toDec, toAm, mkHold } from "@/lib/constants";

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

type Price = { price: number; link?: string; alt: boolean };
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
        if (!(o.price > 1.01)) continue;   // dead or off-the-board lines (1.00) break the math
        const label = family === "ml" ? o.name : family === "spread" ? `${o.name} ${pt(point!)}` : `${o.name} ${point}`;
        const k = `${family}|${label}`;
        if (!out.has(k)) out.set(k, { label, family, name: o.name, point, books: {} });
        const s = out.get(k)!;
        const prev = s.books[bm.key];
        // The main line wins over the same line listed again under alternates.
        if (!prev || (prev.alt && !alt) || (prev.alt === alt && o.price > prev.price)) {
          s.books[bm.key] = { price: o.price, link: o.link || bm.link, alt };
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

// Finds games where the FIXED book has odds in your range and the HEDGE book has the best
// price on the exact opposite side (same line for spreads and totals). Sorted by hold.
export function useGameFinder() {
  const [games, setGames] = useState<FinderGame[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updated, setUpdated] = useState<string | null>(null);
  const [callsLeft, setCallsLeft] = useState<string | null>(null);
  const [cached, setCached] = useState(false);

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
    for (const game of raw) {
      const sels = selections(game);
      const league = Object.entries(LEAGUE_SPORT).find(([, v]) => v === game.sport_key)?.[0];
      for (const s of sels.values()) {
        const fixed = s.books[fk!];
        if (!fixed) continue;
        if (minD && fixed.price < minD) continue;
        if (maxD && fixed.price > maxD) continue;
        const ok = oppositeKey(s, game);
        const opp = ok ? sels.get(ok) : undefined;
        if (!opp) continue;
        const hedgeOpts = hks.map(k => ({ k, side: opp.books[k] })).filter(x => x.side);
        if (!hedgeOpts.length) continue;
        const best = hedgeOpts.reduce((a, b) => (b.side!.price > a.side!.price ? b : a));
        const market = s.family === "ml" ? "Moneyline" : `${fixed.alt || best.side!.alt ? "Alt " : ""}${s.family === "spread" ? "spread" : "total"}`;
        results.push({
          id: game.id,
          key: `${game.id}|${s.family}|${s.label}`,
          home: game.home_team, away: game.away_team,
          commence: game.commence_time,
          family: s.family,
          market: market.charAt(0).toUpperCase() + market.slice(1),
          fixedTeam: s.label, hedgeTeam: opp.label,
          fixedDecimal: fixed.price, hedgeDecimal: best.side!.price,
          fixedAmerican: toAm(fixed.price), hedgeAmerican: toAm(best.side!.price),
          hedgeBookName: BOOK_MAP[best.k] || best.k,
          hedgeBookKey: best.k,
          hold: mkHold(fixed.price, best.side!.price),
          fixedLink: fixed.link, hedgeLink: best.side!.link,
          league,
        });
      }
    }

    setGames(results.sort((a, b) => a.hold - b.hold));
    setUpdated(new Date().toLocaleTimeString());
    setCached(anyCached);
    setLoading(false);
  };

  return { games, loading, error, updated, callsLeft, cached, fetchGames };
}
