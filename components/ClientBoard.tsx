"use client";
import Link from "next/link";
import { money0 } from "@/lib/db";
import { PROMO_FIRST_DAY, PROMO_LAST_DAY, addDays, dayOn, offerBooksOf, weekday } from "@/lib/cadence";
import type { CadencePlay, ClientCadence } from "@/lib/cadence";
import { bookStyle } from "@/components/Journey";

const PROMO_WEEKDAYS = new Set([2, 4, 0]);   // $500 FanDuel promo days: Tue, Thu, Sun

export interface BoardRow {
  id: string; name: string; sub: string;
  cad: ClientCadence; plays: CadencePlay[]; owes: number;
  next: string; nextSub?: string; hot?: boolean; warn?: boolean;
  action?: React.ReactNode;
}
export interface BoardGroup { key: string; title: string; range: string; rule: string; hot?: boolean; rows: BoardRow[] }

/** Days 1–30 from the first FanDuel bet, one cell per day, with the book of any play that day. */
function track(cad: ClientCadence, plays: CadencePlay[]) {
  if (!cad.startedOn) return { cells: [] as Cell[], after: 0 };
  const byDay = new Map<number, CadencePlay[]>();
  let after = 0;
  plays.filter(p => p.status !== "void" && p.status !== "sent" && p.date).forEach(p => {
    const d = dayOn(cad.startedOn!, p.date!);
    if (d > PROMO_LAST_DAY) { after++; return; }
    if (d < 1) return;
    const a = byDay.get(d) || []; a.push(p); byDay.set(d, a);
  });
  const now = cad.day || 0;
  const cells: Cell[] = Array.from({ length: PROMO_LAST_DAY }, (_, i) => {
    const d = i + 1;
    const ps = byDay.get(d) || [];
    const book = ps.length ? offerBooksOf(ps[0])[0] || null : null;
    return {
      d, n: ps.length, book, open: ps.some(p => p.status === "open"), today: d === now, future: d > now,
      promo: d >= PROMO_FIRST_DAY && PROMO_WEEKDAYS.has(weekday(addDays(cad.startedOn!, d - 1))),
      label: ps.map(p => p.promo || "play").join(", "),
    };
  });
  return { cells, after };
}
interface Cell { d: number; n: number; book: string | null; open: boolean; today: boolean; future: boolean; promo: boolean; label: string }

export default function ClientBoard({ groups }: { groups: BoardGroup[] }) {
  return (
    <div className="board">
      <div className="bd-legend">
        <span>Track = days 1–30 from the first FanDuel bet</span>
        {["FanDuel", "DraftKings", "theScore Bet", "BetMGM"].map(b => (
          <span key={b}><i className="bd-key" style={{ background: bookStyle(b).color }}>{bookStyle(b).k}</i>{b === "theScore Bet" ? "theScore" : b}</span>
        ))}
        <span><i className="bd-key" style={{ background: "var(--bk-other)" }}>X</i>Other or casino</span>
        <span><i className="bd-key open" />Open bet</span>
        <span><i className="bd-key today" />Today</span>
        <span><i className="bd-key promo" />$500 promo day</span>
      </div>
      {groups.filter(g => g.rows.length).map(g => (
        <section key={g.key} className={`bd-group${g.hot ? " hot" : ""}`}>
          <div className="bd-group-head">
            <div><span className="bd-group-title">{g.title}</span> <span className="task-sub">{g.range} · {g.rows.length}</span></div>
            <span className="task-sub">{g.rule}</span>
          </div>
          <div className="bd-list">
            {g.rows.map(r => {
              const { cells, after } = track(r.cad, r.plays);
              return (
                <div key={r.id} className="bd-row">
                  <div className="bd-name">
                    <Link href={`/clients/${r.id}`}>{r.name}</Link>
                    <span className="task-sub">{r.sub}</span>
                  </div>
                  <div className="bd-track" aria-label={`${r.name}: 30-day track`}>
                    {cells.length === 0 && <span className="task-sub" style={{ gridColumn: "1 / -1" }}>No FanDuel bet yet</span>}
                    {cells.map(c => {
                      const st = bookStyle(c.book);
                      return (
                        <span key={c.d} className={`bd-cell${c.future ? " future" : ""}${c.today ? " today" : ""}${c.promo ? " promo" : ""}`}
                          title={`Day ${c.d}${c.promo ? " · $500 promo day" : ""}${c.n ? ` · ${c.label}${c.open ? " (open)" : ""}` : ""}`}>
                          {c.n > 0 && (
                            <i className={`bd-play${c.open ? " open" : ""}`} style={{ borderColor: st.color, background: c.open ? "transparent" : st.color }}>
                              {st.k}
                            </i>
                          )}
                        </span>
                      );
                    })}
                    {cells.length > 0 && <span className="bd-after">{after ? `+${after}` : ""}</span>}
                  </div>
                  <span className="bd-owes">{r.owes > 0.5 ? money0(r.owes) : "—"}</span>
                  <div className={`bd-next${r.hot ? " hot" : ""}${r.warn ? " warn" : ""}`}>
                    <b>{r.next}</b>
                    {r.nextSub && <span className="task-sub">{r.nextSub}</span>}
                  </div>
                  <div className="bd-act">{r.action}</div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
