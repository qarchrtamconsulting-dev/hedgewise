"use client";
import { useState } from "react";
import FinderShell from "./FinderShell";
import GameCard from "./GameCard";
import { useGameFinder, FinderConfig } from "./useGameFinder";
import { USDInput } from "./ui";
import { fmt } from "@/lib/constants";

export default function LowHoldFinder() {
  const [cashSize, setCashSize] = useState("100");
  const [config, setConfig] = useState<FinderConfig>({
    fixedBook: "FanDuel",
    leagues: ["NBA", "MLB"],
    hedgeBooks: ["DraftKings", "BetMGM", "Caesars"],
    fixedMinAmerican: "-200",
    fixedMaxAmerican: "+1000",
    hideLive: true,
  });
  const finder = useGameFinder();
  const cash = parseFloat(cashSize);

  return (
    <FinderShell
      title="Low Hold Finder"
      accent="#ffd60a"
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
          <span className="label">Cash Bet Size (per side) *</span>
          <USDInput value={cashSize} set={setCashSize} placeholder="100.00" />
          <div style={{ color: "#444", fontSize: 11, marginTop: 8, lineHeight: 1.5 }}>
            Bet $X on each side to clear wagering at minimum hold cost. Lower hold = lower qualifying loss.
          </div>
        </div>
      }
      renderGame={(g) => {
        // Low hold: bet equal cash on each side
        const fixedNet = cash * (g.fixedDecimal - 1) - cash;
        const hedgeNet = cash * (g.hedgeDecimal - 1) - cash;
        const qualLoss = Math.min(fixedNet, hedgeNet);
        const totalWagered = cash * 2;

        return (
          <GameCard
            key={g.id}
            game={g}
            fixedBookName={config.fixedBook}
            stats={[
              { label: "Each Side", value: fmt(cash || 0) },
              { label: "Total Wagered", value: fmt(totalWagered) },
              { label: "Qual Loss", value: `${qualLoss >= 0 ? "+" : "-"}${fmt(qualLoss)}`, color: qualLoss >= 0 ? "#39ff14" : "#ff9800" },
              { label: "If Fixed Wins", value: `${fixedNet >= 0 ? "+" : "-"}${fmt(fixedNet)}`, color: fixedNet >= 0 ? "#39ff14" : "#ff4444" },
              { label: "If Hedge Wins", value: `${hedgeNet >= 0 ? "+" : "-"}${fmt(hedgeNet)}`, color: hedgeNet >= 0 ? "#39ff14" : "#ff4444" },
            ]}
            showHold={true}
          />
        );
      }}
    />
  );
}
