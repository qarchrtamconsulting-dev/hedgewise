"use client";
import { ReactNode, useEffect, useRef, useState } from "react";
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
  /** Per-game render (right panel) — receives game and its rank */
  renderGame: (g: FinderGame, rank: number) => ReactNode;
  /** Best games first: lower score ranks higher (default: hold) */
  score?: (g: FinderGame) => number;
}

export default function FinderShell({
  title, presetBar, config, setConfig, games: rawGames, loading, error, updated, callsLeft, cached, onFetch, inputs, renderGame, score,
}: Props) {
  const set = (patch: Partial<FinderConfig>) => setConfig({ ...config, ...patch });
  const games = score ? [...rawGames].sort((a, b) => score(a) - score(b)) : rawGames;

  // After a search, fold the settings away and show only the games.
  // Back (button, browser back, or phone swipe) brings the settings back.
  const [showResults, setShowResults] = useState(false);
  const pushed = useRef(false);
  const wasLoading = useRef(false);

  useEffect(() => {
    if (loading && !wasLoading.current) open();
    wasLoading.current = loading;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  useEffect(() => {
    const onPop = () => { if (pushed.current) { pushed.current = false; setShowResults(false); } };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function open() {
    setShowResults(true);
    if (!pushed.current) { window.history.pushState({ hwResults: true }, ""); pushed.current = true; }
    window.scrollTo({ top: 0 });
  }
  const back = () => {
    if (pushed.current) window.history.back();   // popstate handler closes the results view
    else setShowResults(false);
  };

  const list = (
    <>
      {games.length === 0 && !loading && (
        <div className="card" style={{ textAlign: "center", padding: "72px 20px", borderStyle: "dashed", background: "transparent", boxShadow: "none" }}>
          <div style={{ color: "var(--text-2)", fontSize: 13 }}>{showResults ? "No games matched" : "No results yet"}</div>
          <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>{showResults ? "Go back and widen the odds range or add books and leagues." : "Set your inputs and books, then find games."}</div>
        </div>
      )}
      {loading && games.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: "48px 20px", color: "var(--muted)", fontSize: 13 }}>Finding games…</div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {games.map((g, i) => renderGame(g, i + 1))}
      </div>
    </>
  );

  if (showResults) {
    const summary = [config.fixedBook, config.leagues.join(", "), `${config.fixedMinAmerican} to ${config.fixedMaxAmerican}`].filter(Boolean).join(" · ");
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 1040, margin: "0 auto", width: "100%" }}>
        <div className="card" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", position: "sticky", top: 60, zIndex: 5, padding: "10px 14px" }}>
          <button className="btn-ghost" onClick={back} style={{ fontSize: 13, padding: "6px 12px" }}>← Back</button>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div className="section-title">{title}{games.length > 0 ? ` · ${games.length} game${games.length === 1 ? "" : "s"}` : ""}</div>
            <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 2 }}>
              {summary}{updated ? ` · updated ${updated}` : ""}{callsLeft ? ` · ${callsLeft} API calls left` : ""}
            </div>
          </div>
          <button className="btn-primary" onClick={onFetch} disabled={loading} style={{ width: "auto", padding: "8px 16px" }}>
            {loading ? "Fetching…" : "Refresh"}
          </button>
        </div>
        {error && <div style={{ color: "var(--neg)", fontSize: 12, lineHeight: 1.5 }}>{error}</div>}
        {list}
      </div>
    );
  }

  return (
    <div className="grid-2col" style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 20, alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "2px 2px 4px" }}>
          <div className="section-title" style={{ fontSize: 15 }}>{title}</div>
          <button className="btn-primary" onClick={onFetch} disabled={loading} style={{ width: "auto", padding: "8px 16px" }}>
            {loading ? "Fetching…" : "Find games"}
          </button>
        </div>
        {error && <div style={{ color: "var(--neg)", fontSize: 12, lineHeight: 1.5 }}>{error}</div>}
        {callsLeft && (
          <div className="num" style={{ color: "var(--muted)", fontSize: 11, marginTop: -4 }}>
            {callsLeft} API calls left{cached ? " · cached" : ""}
          </div>
        )}

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

      </div>

      <div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12, minHeight: 22 }}>
          <div className="section-title">{games.length > 0 ? `${games.length} game${games.length === 1 ? "" : "s"}` : "Results"}</div>
          {updated && <span style={{ color: "var(--muted)", fontSize: 12 }}>Updated {updated}</span>}
        </div>

        {games.length > 0 && (
          <button className="btn-ghost" onClick={open} style={{ marginBottom: 10 }}>Show results only</button>
        )}
        {list}
      </div>
    </div>
  );
}
