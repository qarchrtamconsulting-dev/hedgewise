"use client";
import { useState } from "react";
import FinderShell from "./FinderShell";
import GameCard from "./GameCard";
import { useGameFinder, FinderConfig } from "./useGameFinder";
import { fmt, toAm } from "@/lib/constants";

export default function ProfitBoostFinder() {
  const [stake, setStake] = useState("100");
  const [boostPct, setBoostPct] = useState("25");
  const [maxBoostCap, setMaxBoostCap] = useState("50");
  const [config, setConfig] = useState<FinderConfig>({
    fixedBook: "FanDuel",
    leagues: ["NBA", "MLB"],
    hedgeBooks: ["DraftKings", "BetMGM", "Caesars"],
    fixedMinAmerican: "-200",
    fixedMaxAmerican: "+300",
    hideLive: true,
  });
  const finder = useGameFinder();

  const s = parseFloat(stake);
  const b = parseFloat(boostPct) / 100;
  const cap = parseFloat(maxBoostCap);

  return (
    <FinderShell
      title="Profit Boost Finder"
      accent="#39ff14"
      config={config}
      setConfig={setConfig}
      games={finder.games}
      loading={finder.loading}
      error={finder.error}
      updated={finder.updated}
      callsLeft={finder.callsLeft}
      cached={finder.cached}
      onFetch={() => finder.fetchGames(config)}
      inputs={
        <div className="card">
          <div style={{ marginBottom: 12 }}>
            <span className="label">Bet Stake *</span>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#3a3a5a", fontSize: 14 }}>$</span>
              <input className="input" value={stake} onChange={e => setStake(e.target.value)} style={{ paddingLeft: 24 }} />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <span className="label">Boost % *</span>
            <input className="input" value={boostPct} onChange={e => setBoostPct(e.target.value)} placeholder="25" />
          </div>
          <div>
            <span className="label">Max Boost Cap (USD)</span>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#3a3a5a", fontSize: 14 }}>$</span>
              <input className="input" value={maxBoostCap} onChange={e => setMaxBoostCap(e.target.value)} style={{ paddingLeft: 24 }} />
            </div>
          </div>
        </div>
      }
      renderGame={(g) => {
        // Boost math:
        // Real bet at boosted effective odds. Boosted profit = min(stake*(d-1)*boost, cap)
        // Effective payout = stake + stake*(d-1) + boostedExtra
        const baseProfit = s * (g.fixedDecimal - 1);
        const boostedExtra = Math.min(baseProfit * b, cap);
        const boostedPayout = s + baseProfit + boostedExtra;
        const boostedDecimal = boostedPayout / s;
        const hedgeStake = boostedPayout / g.hedgeDecimal;
        const guaranteed = boostedPayout - hedgeStake - s;

        return (
          <GameCard
            key={g.id}
            game={g}
            fixedBookName={config.fixedBook}
            stats={[
              { label: "Stake", value: fmt(s || 0) },
              { label: "Boosted Odds", value: toAm(boostedDecimal), color: "#39ff14" },
              { label: "Hedge Stake", value: fmt(hedgeStake), color: "#ffd60a" },
              { label: "Guaranteed Profit", value: fmt(guaranteed), color: "#39ff14" },
            ]}
            showHold={false}
          />
        );
      }}
    />
  );
}
