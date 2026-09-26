"use client";
import { FinderGame } from "./useGameFinder";
import { holdColor, fmt } from "@/lib/constants";

interface Stat { label: string; value: string; color?: string; }

interface Props {
  game: FinderGame;
  fixedBookName: string;
  /** stats shown in the bottom row (e.g. hedge stake, profit) */
  stats: Stat[];
  showHold?: boolean;
}

export default function GameCard({ game, fixedBookName, stats, showHold = true }: Props) {
  return (
    <div className="card" style={{ borderColor: showHold ? holdColor(game.hold) + "55" : "#1e1e35" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 14, marginBottom: 3 }}>
            {game.away} <span style={{ color: "#1a1a35" }}>@</span> {game.home}
          </div>
          <div style={{ color: "#1e1e38", fontSize: 10, marginBottom: 13 }}>
            {new Date(game.commence).toLocaleDateString()} · {new Date(game.commence).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "stretch" }}>
            <div style={{ background: "#05050f", borderRadius: 8, padding: "9px 14px", border: "1px solid #0e0e20", display: "flex", flexDirection: "column" }}>
              <div style={{ color: "#252545", fontSize: 9, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>{fixedBookName} · BET</div>
              <div style={{ color: "#00e5ff", fontWeight: 800, fontSize: 22 }}>{game.fixedAmerican}</div>
              <div style={{ color: "#1e1e38", fontSize: 10, marginTop: 3 }}>{game.fixedTeam}</div>
              {game.fixedLink && (
                <a href={game.fixedLink} target="_blank" rel="noopener noreferrer"
                  style={{ display: "inline-block", marginTop: 8, color: "#00e5ff", border: "1px solid #00e5ff44", borderRadius: 4, padding: "3px 8px", fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textAlign: "center" }}>
                  Open in {fixedBookName} →
                </a>
              )}
            </div>

            <div style={{ background: "#05050f", borderRadius: 8, padding: "9px 14px", border: "1px solid #0e0e20", display: "flex", flexDirection: "column" }}>
              <div style={{ color: "#252545", fontSize: 9, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>{game.hedgeBookName} · HEDGE</div>
              <div style={{ color: "#b388ff", fontWeight: 800, fontSize: 22 }}>{game.hedgeAmerican}</div>
              <div style={{ color: "#1e1e38", fontSize: 10, marginTop: 3 }}>{game.hedgeTeam}</div>
              {game.hedgeLink && (
                <a href={game.hedgeLink} target="_blank" rel="noopener noreferrer"
                  style={{ display: "inline-block", marginTop: 8, color: "#b388ff", border: "1px solid #b388ff44", borderRadius: 4, padding: "3px 8px", fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textAlign: "center" }}>
                  Open in {game.hedgeBookName} →
                </a>
              )}
            </div>
          </div>

          {stats.length > 0 && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #14142a", display: "flex", gap: 20, flexWrap: "wrap" }}>
              {stats.map((s, i) => (
                <div key={i}>
                  <div style={{ color: "#252545", fontSize: 9, letterSpacing: 1, textTransform: "uppercase" }}>{s.label}</div>
                  <div style={{ color: s.color || "#fff", fontSize: 14, fontWeight: 700, marginTop: 2 }}>{s.value}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {showHold && (
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ color: holdColor(game.hold), fontWeight: 800, fontSize: 26, lineHeight: 1 }}>{game.hold.toFixed(2)}%</div>
            <div style={{ color: "#1a1a35", fontSize: 10, marginTop: 3 }}>hold</div>
          </div>
        )}
      </div>
    </div>
  );
}
