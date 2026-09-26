"use client";
import { useState } from "react";
import FinderShell from "./FinderShell";
import GameCard from "./GameCard";
import { useGameFinder, FinderConfig } from "./useGameFinder";
import PresetBar from "./PresetBar";
import { PresetState, defaultPreset } from "@/lib/presets";
import { fmt, toAm } from "@/lib/constants";

export default function ProfitBoostFinder({ initial, initialName }: { initial?: PresetState; initialName?: string }) {
  const start = initial || defaultPreset("boost");
  const [stake, setStake] = useState<string>(String(start.inputs.stake ?? "100"));
  const [boostPct, setBoostPct] = useState<string>(String(start.inputs.boost ?? "25"));
  const [maxBoostCap, setMaxBoostCap] = useState<string>(String(start.inputs.cap ?? "50"));
  const [config, setConfig] = useState<FinderConfig>(start.config);
  const finder = useGameFinder();
  const current: PresetState = { config, inputs: { stake: stake, boost: boostPct, cap: maxBoostCap } };
  const apply = (p: PresetState) => {
    setConfig(p.config);
    if (p.inputs.stake !== undefined) setStake(String(p.inputs.stake));
    if (p.inputs.boost !== undefined) setBoostPct(String(p.inputs.boost));
    if (p.inputs.cap !== undefined) setMaxBoostCap(String(p.inputs.cap));
    finder.fetchGames(p.config);   // load games for the preset right away
  };

  const s = parseFloat(stake);
  const b = parseFloat(boostPct) / 100;
  const cap = parseFloat(maxBoostCap);

  return (
    <FinderShell
      title="Profit Boost Finder"
      presetBar={<PresetBar tool="boost" current={current} apply={apply} initialName={initialName} />}
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
            <span className="label">Bet stake</span>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", fontSize: 14, pointerEvents: "none" }}>$</span>
              <input className="input" value={stake} onChange={e => setStake(e.target.value)} style={{ paddingLeft: 24 }} />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <span className="label">Boost %</span>
            <input className="input" value={boostPct} onChange={e => setBoostPct(e.target.value)} placeholder="25" />
          </div>
          <div>
            <span className="label">Max boost cap</span>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", fontSize: 14, pointerEvents: "none" }}>$</span>
              <input className="input" value={maxBoostCap} onChange={e => setMaxBoostCap(e.target.value)} style={{ paddingLeft: 24 }} />
            </div>
          </div>
        </div>
      }
      score={(g) => { const base = s * (g.fixedDecimal - 1); const pay = s + base + Math.min(base * b, cap); return -(pay - pay / g.hedgeDecimal - s); }}
      renderGame={(g, rank) => {
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
            rank={rank}
            fixedBookName={config.fixedBook}
            fixedStake={s || 0}
            hedgeStake={hedgeStake}
            fixedTag="Boosted"
            fixedOddsNote={`Boosted to ${toAm(boostedDecimal)}`}
            metric={{ label: "Locked profit", value: `${guaranteed >= 0 ? "+" : "−"}$${Math.abs(guaranteed).toFixed(2)}`, tone: guaranteed >= 0 ? "pos" : "neg" }}
            outcomes={[
              { label: `${g.fixedTeam} win`, value: guaranteed },
              { label: `${g.hedgeTeam} win`, value: guaranteed },
            ]}
            details={[{ label: "Hold", value: `${g.hold.toFixed(2)}%` }]}
            ticket={{ type: "Profit Boost", amount: s || 0, fixedStake: s || 0, hedgeStake, expected: guaranteed, fixedNote: "apply your profit boost", fixedPayout: boostedPayout, hedgePayout: hedgeStake * g.hedgeDecimal }}
          />
        );
      }}
    />
  );
}
