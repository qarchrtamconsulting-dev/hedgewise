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
          <span className="label">Fixed book stake</span>
          <USDInput value={cashSize} set={setCashSize} placeholder="100.00" />
          <div className="hint">
            Hedge is sized so both outcomes pay the same. Lower hold means a smaller qualifying loss.
          </div>
        </div>
      }
      renderGame={(g) => {
        // Low hold: fixed-book stake is the input; hedge is sized so both outcomes pay the same.
        const stake = cash || 0;
        const hedgeStake = (stake * g.fixedDecimal) / g.hedgeDecimal;
        const fixedNet = stake * (g.fixedDecimal - 1) - hedgeStake;
        const hedgeNet = hedgeStake * (g.hedgeDecimal - 1) - stake;
        const totalWagered = stake + hedgeStake;
        const signed = (n: number) => `${n >= 0 ? "+" : "-"}${fmt(n)}`;
        const tone = (n: number) => (n >= 0 ? "var(--pos)" : "var(--neg)");

        return (
          <GameCard
            key={g.id}
            game={g}
            fixedBookName={config.fixedBook}
            stats={[
              { label: `${config.fixedBook || "Fixed"} stake`, value: fmt(stake) },
              { label: "Hedge stake", value: fmt(hedgeStake) },
              { label: "Total wagered", value: fmt(totalWagered) },
              { label: "If fixed wins", value: signed(fixedNet), color: tone(fixedNet) },
              { label: "If hedge wins", value: signed(hedgeNet), color: tone(hedgeNet) },
            ]}
            showHold={true}
          />
        );
      }}
    />
  );
}
