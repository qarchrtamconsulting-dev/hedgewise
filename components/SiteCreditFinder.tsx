"use client";
import { useState } from "react";
import FinderShell from "./FinderShell";
import GameCard from "./GameCard";
import { useGameFinder, FinderConfig } from "./useGameFinder";
import { USDInput } from "./ui";
import PresetBar from "./PresetBar";
import { PresetState, defaultPreset } from "@/lib/presets";
import { fmt, round5 } from "@/lib/constants";

/**
 * Site credit / deposit match: bonus money that pays out like cash (the stake comes back when it wins).
 * Credit wins:  credit × odds − hedge.   Hedge wins: hedge × (odds − 1).
 * Hedge = credit × fixed odds ÷ hedge odds, which locks about credit ÷ (1 + hold).
 */
export default function SiteCreditFinder({ initial, initialName }: { initial?: PresetState; initialName?: string }) {
  const start = initial || defaultPreset("credit");
  const [amount, setAmount] = useState<string>(String(start.inputs.amount ?? "250"));
  const [config, setConfig] = useState<FinderConfig>(start.config);
  const finder = useGameFinder();
  const current: PresetState = { config, inputs: { amount } };
  const apply = (p: PresetState) => {
    setConfig(p.config);
    if (p.inputs.amount !== undefined) setAmount(String(p.inputs.amount));
    finder.fetchGames(p.config);
  };

  const credit = parseFloat(amount) || 0;

  return (
    <FinderShell
      title="Site Credit Finder"
      presetBar={<PresetBar tool="credit" current={current} apply={apply} initialName={initialName} />}
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
          <span className="label">Site credit amount</span>
          <USDInput value={amount} set={setAmount} placeholder="250.00" />
          <div className="hint">
            Deposit match or site credit that pays out like cash when it wins. Lowest hold converts best; a $250 credit locks about $230 at a normal line.
          </div>
        </div>
      }
      score={(g) => -(g.fixedDecimal * (1 - 1 / g.hedgeDecimal))}
      renderGame={(g, rank) => {
        const hedgeStake = round5((credit * g.fixedDecimal) / g.hedgeDecimal);   // slips go out in $5 amounts
        const creditWins = credit * g.fixedDecimal - hedgeStake;
        const hedgeWins = hedgeStake * (g.hedgeDecimal - 1);
        const locked = Math.min(creditWins, hedgeWins);
        const conversion = credit > 0 ? (locked / credit) * 100 : 0;

        return (
          <GameCard
            key={g.key}
            game={g}
            rank={rank}
            fixedBookName={config.fixedBook}
            fixedStake={credit}
            hedgeStake={hedgeStake}
            fixedTag="Site credit"
            metric={{ label: "Conversion", value: `${conversion.toFixed(1)}%`, tone: conversion >= 90 ? "pos" : conversion >= 85 ? "warn" : "neg" }}
            outcomes={[
              { label: `${g.fixedTeam} ${g.family === "ml" ? "win" : "hits"}`, value: creditWins },
              { label: `${g.hedgeTeam} ${g.family === "ml" ? "win" : "hits"}`, value: hedgeWins },
            ]}
            details={[{ label: "Hold", value: `${g.hold.toFixed(2)}%` }, { label: "Cash on the hedge", value: fmt(hedgeStake) }]}
            ticket={{ type: "Site Credit", amount: credit, fixedStake: credit, hedgeStake, expected: locked, fixedNote: "use your site credit", fixedIsCredit: true, fixedPayout: credit * g.fixedDecimal, hedgePayout: hedgeStake * g.hedgeDecimal }}
          />
        );
      }}
    />
  );
}
