"use client";
import { useState } from "react";
import FinderShell from "./FinderShell";
import GameCard from "./GameCard";
import { useGameFinder, FinderConfig } from "./useGameFinder";
import { USDInput } from "./ui";
import { fmt } from "@/lib/constants";

export default function FreeBetFinder() {
  const [freeBetAmt, setFreeBetAmt] = useState("500");
  const [config, setConfig] = useState<FinderConfig>({
    fixedBook: "FanDuel",
    leagues: ["NBA", "MLB"],
    hedgeBooks: ["DraftKings", "BetMGM", "Caesars"],
    fixedMinAmerican: "+200",   // free bets convert better at +odds
    fixedMaxAmerican: "+800",
    hideLive: true,
  });
  const finder = useGameFinder();

  const fb = parseFloat(freeBetAmt);

  return (
    <FinderShell
      title="Free Bet Finder"
      accent="#00e5ff"
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
          <span className="label">Free Bet Amount *</span>
          <USDInput value={freeBetAmt} set={setFreeBetAmt} placeholder="500.00" />
          <div style={{ color: "#444", fontSize: 11, marginTop: 8, lineHeight: 1.5 }}>
            Stake-not-returned free bet. Tool finds + odds at your fixed book and best - odds hedge to lock in profit.
          </div>
        </div>
      }
      renderGame={(g) => {
        // Free bet math: profit if FB wins = fb * (decimal - 1). Hedge = profit / hedge_decimal.
        const fbProfit = fb * (g.fixedDecimal - 1);
        const hedgeStake = fbProfit / g.hedgeDecimal;
        const guaranteed = fbProfit - hedgeStake;
        const conversion = fb > 0 ? (guaranteed / fb) * 100 : 0;

        return (
          <GameCard
            key={g.id}
            game={g}
            fixedBookName={config.fixedBook}
            stats={[
              { label: "Free Bet", value: fmt(fb || 0) },
              { label: "Hedge Stake", value: fmt(hedgeStake), color: "#ffd60a" },
              { label: "Guaranteed Profit", value: fmt(guaranteed), color: "#39ff14" },
              { label: "Conversion %", value: `${conversion.toFixed(1)}%`, color: "#39ff14" },
            ]}
            showHold={false}
          />
        );
      }}
    />
  );
}
