"use client";
import { useState } from "react";
import { BOOK_MAP, LEAGUE_SPORT, toDec, toAm, mkHold } from "@/lib/constants";

export interface FinderGame {
  id: string;
  home: string; away: string;
  commence: string;
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
}

export interface FinderConfig {
  fixedBook: string;
  leagues: string[];
  hedgeBooks: string[];
  fixedMinAmerican: string;
  fixedMaxAmerican: string;
  hideLive: boolean;
}

// Filters games where the FIXED book has odds in your range
// and the HEDGE book has the best opposing line. Returns sorted by hold.
export function useGameFinder() {
  const [games, setGames] = useState<FinderGame[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updated, setUpdated] = useState<string | null>(null);
  const [callsLeft, setCallsLeft] = useState<string | null>(null);
  const [cached, setCached] = useState(false);

  const fetchGames = async (cfg: FinderConfig) => {
    if (!cfg.fixedBook || !cfg.leagues.length || !cfg.hedgeBooks.length) {
      setError("Pick a Fixed Book, at least one League, and at least one Hedge Book.");
      return;
    }
    setLoading(true); setError(null); setGames([]);

    const fk = Object.entries(BOOK_MAP).find(([, v]) => v === cfg.fixedBook)?.[0];
    const hks = cfg.hedgeBooks.map(b => Object.entries(BOOK_MAP).find(([, v]) => v === b)?.[0]).filter(Boolean) as string[];
    const allKeys = [...new Set([fk, ...hks])].filter(Boolean) as string[];
    const sports = [...new Set(cfg.leagues.map(l => LEAGUE_SPORT[l]).filter(Boolean))];
    const minD = toDec(cfg.fixedMinAmerican);
    const maxD = toDec(cfg.fixedMaxAmerican);
    const now = new Date();
    let raw: any[] = [];
    let anyCached = false;

    for (const sport of sports) {
      try {
        const res = await fetch(`/api/odds?sport=${sport}&bookmakers=${allKeys.join(",")}`);
        const j = await res.json();
        if (j.remaining) setCallsLeft(j.remaining);
        if (j.cached) anyCached = true;
        if (j.error) { setError(j.error); continue; }
        raw = [...raw, ...(j.data || [])];
      } catch (e: any) {
        setError(e.message);
      }
    }

    const results: FinderGame[] = raw.map((game: any) => {
      if (cfg.hideLive && new Date(game.commence_time) <= now) return null;

      // build per-team -> per-book price + link map
      type Side = { price: number; link?: string };
      const sides: Record<string, Record<string, Side>> = {};
      (game.bookmakers || []).forEach((bm: any) => {
        const h2h = bm.markets?.find((m: any) => m.key === "h2h");
        if (!h2h) return;
        h2h.outcomes.forEach((o: any) => {
          if (!sides[o.name]) sides[o.name] = {};
          sides[o.name][bm.key] = { price: o.price, link: o.link || bm.link };
        });
      });

      const teams = Object.keys(sides);
      if (teams.length < 2) return null;

      const combos: any[] = [];
      [[teams[0], teams[1]], [teams[1], teams[0]]].forEach(([ft, ht]) => {
        const fixedSide = sides[ft]?.[fk!]; if (!fixedSide) return;
        const fd = fixedSide.price;
        if (minD && fd < minD) return;
        if (maxD && fd > maxD) return;

        const hedgeOpts = hks.map(k => ({ k, side: sides[ht]?.[k] })).filter(x => x.side);
        if (!hedgeOpts.length) return;
        const best = hedgeOpts.reduce((a, b) => (b.side!.price > a.side!.price ? b : a));
        combos.push({
          ft, ht, fd, hd: best.side!.price, hk: best.k,
          fLink: fixedSide.link, hLink: best.side!.link,
          h: mkHold(fd, best.side!.price),
        });
      });

      if (!combos.length) return null;
      const best = combos.sort((a, b) => a.h - b.h)[0];

      return {
        id: game.id,
        home: game.home_team, away: game.away_team,
        commence: game.commence_time,
        fixedTeam: best.ft, hedgeTeam: best.ht,
        fixedDecimal: best.fd, hedgeDecimal: best.hd,
        fixedAmerican: toAm(best.fd), hedgeAmerican: toAm(best.hd),
        hedgeBookName: BOOK_MAP[best.hk] || best.hk,
        hedgeBookKey: best.hk,
        hold: best.h,
        fixedLink: best.fLink, hedgeLink: best.hLink,
      };
    }).filter(Boolean) as FinderGame[];

    setGames(results.sort((a, b) => a.hold - b.hold));
    setUpdated(new Date().toLocaleTimeString());
    setCached(anyCached);
    setLoading(false);
  };

  return { games, loading, error, updated, callsLeft, cached, fetchGames };
}
