"use client";
import { FinderGame } from "./useGameFinder";

import SendTicket, { Ticket } from "./SendTicket";

type Tone = "pos" | "neg" | "warn" | "neutral";

interface Props {
  game: FinderGame;
  fixedBookName: string;
  rank?: number;
  /** What to bet on each side */
  fixedStake: number;
  hedgeStake: number;
  /** e.g. "Free bet" / "Risk-free" / "Boosted" shown on the promo leg */
  fixedTag?: string;
  /** Boosted odds etc. shown under the promo leg's odds */
  fixedOddsNote?: string;
  /** The one number that matters for this tool */
  metric: { label: string; value: string; tone?: Tone; color?: string };
  /** Net result for each way the game can end */
  outcomes: { label: string; value: number }[];
  /** Small supporting facts */
  details?: { label: string; value: string }[];
  ticket?: Ticket;
}

const usd = (n: number) => `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const signed = (n: number) => `${n > 0.004 ? "+" : n < -0.004 ? "−" : ""}${usd(n)}`;
const toneColor = (t?: Tone) => t === "pos" ? "var(--pos)" : t === "neg" ? "var(--neg)" : t === "warn" ? "var(--warn)" : "var(--text)";

function when(iso: string) {
  const d = new Date(iso), now = new Date();
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((day(d) - day(now)) / 86400000);
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const label = diffDays === 0 ? (d.getHours() >= 17 ? "Tonight" : "Today") : diffDays === 1 ? "Tomorrow" : d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  const mins = Math.round((d.getTime() - now.getTime()) / 60000);
  const rel = mins <= 0 ? "live" : mins < 60 ? `in ${mins}m` : mins < 48 * 60 ? `in ${Math.floor(mins / 60)}h${mins % 60 && mins < 600 ? ` ${mins % 60}m` : ""}` : "";
  return { text: `${label} ${time}`, rel, soon: mins > 0 && mins < 90 };
}

function Leg({ role, book, team, odds, stake, tag, oddsNote, link }:
  { role: "Bet" | "Hedge"; book: string; team: string; odds: string; stake: number; tag?: string; oddsNote?: string; link?: string | null }) {
  return (
    <div className={`gleg ${role === "Bet" ? "gleg-bet" : ""}`}>
      <div className="gleg-top">
        <span className="gleg-book">{book}</span>
        <span className="gleg-role">{tag || role}</span>
      </div>
      <div className="gleg-team">{team}</div>
      <div className="gleg-row">
        <div>
          <div className="gleg-odds num">{odds}</div>
          {oddsNote && <div className="gleg-note">{oddsNote}</div>}
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="gleg-stake-label">Stake</div>
          <div className="gleg-stake num">{usd(stake)}</div>
        </div>
      </div>
      {link && <a className="gleg-open" href={link} target="_blank" rel="noopener noreferrer">Open {book} ↗</a>}
    </div>
  );
}

export default function GameCard({ game, fixedBookName, rank, fixedStake, hedgeStake, fixedTag, fixedOddsNote, metric, outcomes, details, ticket }: Props) {
  const t = when(game.commence);
  const worst = outcomes.length ? Math.min(...outcomes.map(o => o.value)) : 0;
  const allSame = outcomes.length > 1 && outcomes.every(o => Math.abs(o.value - outcomes[0].value) < 0.01);

  return (
    <div className="game">
      <div className="game-head">
        <div style={{ minWidth: 0 }}>
          <div className="game-title">
            {rank != null && <span className="game-rank num">{rank}</span>}
            <span>{game.away}</span><span className="game-at">at</span><span>{game.home}</span>
          </div>
          <div className="game-meta">
            {game.league && <span className="game-chip">{game.league}</span>}
            {game.market && <span className="game-chip">{game.market}</span>}
            <span>{t.text}</span>
            {t.rel && <span className={t.soon || t.rel === "live" ? "game-soon" : ""}>· {t.rel}</span>}
          </div>
        </div>
        <div className="game-metric">
          <div className="game-metric-value num" style={{ color: metric.color || toneColor(metric.tone) }}>{metric.value}</div>
          <div className="stat-label">{metric.label}</div>
        </div>
      </div>

      <div className="game-legs">
        <Leg role="Bet" book={fixedBookName} team={game.fixedTeam} odds={game.fixedAmerican} stake={fixedStake} tag={fixedTag} oddsNote={fixedOddsNote} link={game.fixedLink} />
        <Leg role="Hedge" book={game.hedgeBookName} team={game.hedgeTeam} odds={game.hedgeAmerican} stake={hedgeStake} link={game.hedgeLink} />
      </div>

      <div className="game-foot">
        <div className="game-outcomes">
          {allSame ? (
            <div className="game-outcome">
              <span className="game-outcome-label">Either way</span>
              <span className="num" style={{ color: outcomes[0].value >= 0 ? "var(--pos)" : "var(--neg)", fontWeight: 600 }}>{signed(outcomes[0].value)}</span>
            </div>
          ) : outcomes.map((o, i) => (
            <div key={i} className="game-outcome">
              <span className="game-outcome-label">{o.label}</span>
              <span className="num" style={{ color: o.value >= 0 ? "var(--pos)" : "var(--neg)", fontWeight: o.value === worst ? 600 : 500 }}>{signed(o.value)}</span>
            </div>
          ))}
          {details?.map((d, i) => (
            <div key={`d${i}`} className="game-outcome">
              <span className="game-outcome-label">{d.label}</span>
              <span className="num" style={{ color: "var(--text-2)" }}>{d.value}</span>
            </div>
          ))}
        </div>
        {ticket && <div className="game-send"><SendTicket game={game} fixedBookName={fixedBookName} ticket={ticket} /></div>}
      </div>
    </div>
  );
}

