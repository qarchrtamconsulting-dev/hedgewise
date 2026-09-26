"use client";
import { FinderGame } from "./useGameFinder";
import { holdColor } from "@/lib/constants";

interface Stat { label: string; value: string; color?: string; }

interface Props {
  game: FinderGame;
  fixedBookName: string;
  /** stats shown in the bottom row (e.g. hedge stake, profit) */
  stats: Stat[];
  showHold?: boolean;
}

function Leg({ book, role, odds, team, link }: { book: string; role: string; odds: string; team: string; link?: string | null }) {
  return (
    <div className="leg">
      <div className="stat-label">{book} · {role}</div>
      <div className="leg-odds num" style={{ marginTop: 4 }}>{odds}</div>
      <div style={{ color: "var(--text-2)", fontSize: 12, marginTop: 2 }}>{team}</div>
      {link && (
        <a className="leg-link" href={link} target="_blank" rel="noopener noreferrer">Open {book}</a>
      )}
    </div>
  );
}

export default function GameCard({ game, fixedBookName, stats, showHold = true }: Props) {
  const start = new Date(game.commence);
  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>
            {game.away} <span style={{ color: "var(--muted)", fontWeight: 400 }}>at</span> {game.home}
          </div>
          <div className="num" style={{ color: "var(--muted)", fontSize: 12, marginTop: 2, marginBottom: 12 }}>
            {start.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })} · {start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Leg book={fixedBookName} role="Bet" odds={game.fixedAmerican} team={game.fixedTeam} link={game.fixedLink} />
            <Leg book={game.hedgeBookName} role="Hedge" odds={game.hedgeAmerican} team={game.hedgeTeam} link={game.hedgeLink} />
          </div>

          {stats.length > 0 && (
            <div className="divider" style={{ marginTop: 12, paddingTop: 12, display: "flex", gap: 24, flexWrap: "wrap" }}>
              {stats.map((s, i) => (
                <div key={i}>
                  <div className="stat-label">{s.label}</div>
                  <div className="stat-value num" style={{ color: s.color || "var(--text)" }}>{s.value}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {showHold && (
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div className="num" style={{ color: holdColor(game.hold), fontWeight: 600, fontSize: 22, lineHeight: 1 }}>{game.hold.toFixed(2)}%</div>
            <div className="stat-label" style={{ marginTop: 4 }}>Hold</div>
          </div>
        )}
      </div>
    </div>
  );
}
