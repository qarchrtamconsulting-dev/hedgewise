"use client";
import { ReactNode } from "react";
import { CheckList, Toggle } from "./ui";
import { BOOKS, LEAGUES } from "@/lib/constants";
import { FinderConfig, FinderGame } from "./useGameFinder";

interface Props {
  title: string;
  /** kept for backwards compatibility; the shell now uses the theme accent */
  accent?: string;
  config: FinderConfig;
  setConfig: (c: FinderConfig) => void;
  games: FinderGame[];
  loading: boolean;
  error: string | null;
  updated: string | null;
  callsLeft: string | null;
  cached: boolean;
  onFetch: () => void;
  /** Preset picker / save / share controls */
  presetBar?: ReactNode;
  /** Custom controls (top of left panel) — promo amount input, sliders, etc */
  inputs?: ReactNode;
  /** Per-game render (right panel) — receives game and renders the math */
  renderGame: (g: FinderGame) => ReactNode;
}

export default function FinderShell({
  title, presetBar, config, setConfig, games, loading, error, updated, callsLeft, cached, onFetch, inputs, renderGame,
}: Props) {
  const set = (patch: Partial<FinderConfig>) => setConfig({ ...config, ...patch });

  return (
    <div className="grid-2col" style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 20, alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ padding: "2px 2px 4px" }}>
          <div className="section-title" style={{ fontSize: 15 }}>{title}</div>
        </div>

        {presetBar}

        {inputs}

        <div className="card">
          <span className="label">Fixed book</span>
          <select className="input" value={config.fixedBook} onChange={e => set({ fixedBook: e.target.value })}>
            <option value="">Select a book</option>
            {BOOKS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>

        <CheckList label="Leagues" options={LEAGUES} value={config.leagues} onChange={(v) => set({ leagues: v })} req />
        <CheckList label="Hedge books" options={BOOKS.filter(b => b !== config.fixedBook)} value={config.hedgeBooks} onChange={(v) => set({ hedgeBooks: v })} req />

        <div className="card" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <span className="label">Min odds</span>
            <input className="input num" value={config.fixedMinAmerican} onChange={e => set({ fixedMinAmerican: e.target.value })} />
          </div>
          <div>
            <span className="label">Max odds</span>
            <input className="input num" value={config.fixedMaxAmerican} onChange={e => set({ fixedMaxAmerican: e.target.value })} />
          </div>
          <div style={{ gridColumn: "1 / -1", paddingTop: 4 }}>
            <Toggle on={config.hideLive} set={(v) => set({ hideLive: v })} label="Hide live games" />
          </div>
        </div>

        <button className="btn-primary" onClick={onFetch} disabled={loading}>
          {loading ? "Fetching…" : "Find games"}
        </button>

        {error && <div style={{ color: "var(--neg)", fontSize: 12, lineHeight: 1.5 }}>{error}</div>}
        {callsLeft && (
          <div className="num" style={{ color: "var(--muted)", fontSize: 11 }}>
            {callsLeft} API calls left{cached ? " · cached" : ""}
          </div>
        )}
      </div>

      <div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12, minHeight: 22 }}>
          <div className="section-title">{games.length > 0 ? `${games.length} games` : "Results"}</div>
          {updated && <span style={{ color: "var(--muted)", fontSize: 12 }}>Updated {updated}</span>}
        </div>

        {games.length === 0 && !loading && (
          <div className="card" style={{ textAlign: "center", padding: "72px 20px", borderStyle: "dashed", background: "transparent", boxShadow: "none" }}>
            <div style={{ color: "var(--text-2)", fontSize: 13 }}>No results yet</div>
            <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>Set your inputs and books, then find games.</div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {games.map(g => renderGame(g))}
        </div>
      </div>
    </div>
  );
}
