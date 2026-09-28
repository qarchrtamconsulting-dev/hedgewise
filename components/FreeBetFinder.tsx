"use client";
import { useState } from "react";
import FinderShell from "./FinderShell";
import GameCard from "./GameCard";
import { useGameFinder, FinderConfig } from "./useGameFinder";
import { USDInput } from "./ui";
import PresetBar from "./PresetBar";
import { PresetState, defaultPreset } from "@/lib/presets";
import { fmt, round5 } from "@/lib/constants";

export default function FreeBetFinder({ initial, initialName }: { initial?: PresetState; initialName?: string }) {
  const start = initial || defaultPreset("freebet");
  const [freeBetAmt, setFreeBetAmt] = useState<string>(String(start.inputs.amount ?? "500"));
  const [config, setConfig] = useState<FinderConfig>(start.config);
  const finder = useGameFinder();
  const current: PresetState = { config, inputs: { amount: freeBetAmt } };
  const apply = (p: PresetState) => {
    setConfig(p.config);
    if (p.inputs.amount !== undefined) setFreeBetAmt(String(p.inputs.amount));
    finder.fetchGames(p.config);   // load games for the preset right away
  };

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
      updatedAt={finder.updatedAt}
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
      score={(g) => -((g.fixedDecimal - 1) - (g.fixedDecimal - 1) / g.hedgeDecimal)}
      renderGame={(g, rank) => {
        // Free bet math: profit if FB wins = fb * (decimal - 1). Hedge = profit / hedge_decimal.
        const fbProfit = fb * (g.fixedDecimal - 1);
        const hedgeStake = round5(fbProfit / g.hedgeDecimal);   // slips go out in $5 amounts
        const fbWins = fbProfit - hedgeStake;
        const hedgeWins = hedgeStake * (g.hedgeDecimal - 1);
        const guaranteed = Math.min(fbWins, hedgeWins);
        const conversion = fb > 0 ? (guaranteed / fb) * 100 : 0;

        return (
          <GameCard
            key={g.key}
            recheck={() => finder.recheck(g.key)}
            game={g}
            rank={rank}
            fixedBookName={config.fixedBook}
            fixedStake={fb || 0}
            hedgeStake={hedgeStake}
            fixedTag="Free bet"
            metric={{ label: "Conversion", value: `${conversion.toFixed(1)}%`, tone: conversion >= 65 ? "pos" : conversion >= 55 ? "warn" : "neg" }}
            outcomes={[
              { label: `${g.fixedTeam} ${g.family === "ml" ? "win" : "hits"}`, value: fbWins },
              { label: `${g.hedgeTeam} ${g.family === "ml" ? "win" : "hits"}`, value: hedgeWins },
            ]}
            details={[{ label: "Hold", value: `${g.hold.toFixed(2)}%` }]}
            ticket={{ type: "Free Bet", amount: fb || 0, fixedStake: fb || 0, hedgeStake, expected: guaranteed, fixedNote: "use your free bet", fixedIsCredit: true, fixedPayout: fbProfit, hedgePayout: hedgeStake * g.hedgeDecimal }}
          />
        );
      }}
    />
  );
}
