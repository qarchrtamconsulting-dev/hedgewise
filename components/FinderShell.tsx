"use client";
import { ReactNode } from "react";
import { CheckList, Toggle, USDInput } from "./ui";
import { BOOKS, LEAGUES } from "@/lib/constants";
import { FinderConfig, FinderGame } from "./useGameFinder";

interface Props {
  title: string;
  accent: string;
  config: FinderConfig;
  setConfig: (c: FinderConfig) => void;
  games: FinderGame[];
  loading: boolean;
  error: string | null;
  updated: string | null;
  callsLeft: string | null;
  cached: boolean;
  onFetch: () => void;
  /** Custom controls (top of left panel) — promo amount input, sliders, etc */
  inputs?: ReactNode;
  /** Per-game render (right panel) — receives game and renders the math */
  renderGame: (g: FinderGame) => ReactNode;
}

export default function FinderShell({
  title, accent, config, setConfig, games, loading, error, updated, callsLeft, cached, onFetch, inputs, renderGame,
}: Props) {
  const set = (patch: Partial<FinderConfig>) => setConfig({ ...config, ...patch });

  return (
    <div className="grid-2col" style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 20, alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="card" style={{ borderColor: accent + "55" }}>
          <div style={{ color: accent, fontWeight: 800, fontSize: 11, letterSpacing: 2.5, textTransform: "uppercase" }}>{title}</div>
        </div>

        {inputs}

        <div className="card">
          <span className="label">Select Fixed Book *</span>
          <select className="input" value={config.fixedBook} onChange={e => set({ fixedBook: e.target.value })}>
            <option value="">Select a book...</option>
            {BOOKS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>

        <CheckList label="Select League(s)" options={LEAGUES} value={config.leagues} onChange={(v) => set({ leagues: v })} req />
        <CheckList label="Select Hedge Book(s)" options={BOOKS.filter(b => b !== config.fixedBook)} value={config.hedgeBooks} onChange={(v) => set({ hedgeBooks: v })} req />

        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Toggle on={config.hideLive} set={(v) => set({ hideLive: v })} label="Hide Live Games" />
        </div>

        <div className="card">
          <div style={{ marginBottom: 12 }}>
            <span className="label">Fixed Book Min Odds</span>
            <input className="input" value={config.fixedMinAmerican} onChange={e => set({ fixedMinAmerican: e.target.value })} />
          </div>
          <div>
            <span className="label">Fixed Book Max Odds</span>
            <input className="input" value={config.fixedMaxAmerican} onChange={e => set({ fixedMaxAmerican: e.target.value })} />
          </div>
        </div>

        <button className="btn-primary" onClick={onFetch} disabled={loading} style={{ background: accent, color: "#000" }}>
          {loading ? "⟳ Fetching..." : "⚡ Find Games"}
        </button>

        {error && <div style={{ color: "#ff4444", fontSize: 12, padding: "8px 0", lineHeight: 1.5 }}>⚠ {error}</div>}
        {callsLeft && (
          <div style={{ color: "#444", fontSize: 11, padding: "4px 0" }}>
            {callsLeft} API calls left{cached ? " · cached" : ""}
          </div>
        )}
      </div>

      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 13 }}>
            {games.length > 0 ? `${games.length} games` : "Results"}
            {updated && <span style={{ color: "#252545", fontSize: 10, marginLeft: 8 }}>· {updated}</span>}
          </div>
        </div>

        {games.length === 0 && !loading && (
          <div className="card" style={{ textAlign: "center", padding: "80px 20px" }}>
            <div style={{ fontSize: 48, opacity: 0.06, marginBottom: 14 }}>⚡</div>
            <div style={{ color: "#1a1a35", fontSize: 13 }}>Configure inputs and books, then fetch live games</div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {games.map(g => renderGame(g))}
        </div>
      </div>
    </div>
  );
}
