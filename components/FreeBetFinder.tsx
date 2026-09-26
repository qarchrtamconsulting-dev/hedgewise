"use client";
import { useState } from "react";
import FinderShell from "./FinderShell";
import GameCard from "./GameCard";
import { useGameFinder, FinderConfig } from "./useGameFinder";
import { USDInput } from "./ui";
import PresetBar from "./PresetBar";
import { PresetState, defaultPreset } from "@/lib/presets";
import { fmt } from "@/lib/constants";

export default function FreeBetFinder({ initial, initialName }: { initial?: PresetState; initialName?: string }) {
  const start = initial || defaultPreset("freebet");
  const [freeBetAmt, setFreeBetAmt] = useState<string>(String(start.inputs.amount ?? "500"));
  const [config, setConfig] = useState<FinderConfig>(start.config);
  const current: PresetState = { config, inputs: { amount: freeBetAmt } };
  const apply = (p: PresetState) => {
    setConfig(p.config);
    if (p.inputs.amount !== undefined) setFreeBetAmt(String(p.inputs.amount));
  };
  const finder = useGameFinder();

  const fb = parseFloat(freeBetAmt);

  return (
    <FinderShell
      title="Free Bet Finder"
      presetBar={<PresetBar tool="freebet" current={current} apply={apply} initialName={initialName} />}
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
          <span className="label">Free bet amount</span>
          <USDInput value={freeBetAmt} set={setFreeBetAmt} placeholder="500.00" />
          <div className="hint">
            Stake-not-returned free bet. Finds plus-money odds at your fixed book and the best opposing hedge.
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
              { label: "Free bet", value: fmt(fb || 0) },
              { label: "Hedge stake", value: fmt(hedgeStake) },
              { label: "Guaranteed profit", value: fmt(guaranteed), color: "var(--pos)" },
              { label: "Conversion", value: `${conversion.toFixed(1)}%` },
            ]}
            ticket={{ type: "Free Bet", amount: fb || 0, fixedStake: fb || 0, hedgeStake, expected: guaranteed, fixedNote: "use your free bet" }}
            showHold={false}
          />
        );
      }}
    />
  );
}
