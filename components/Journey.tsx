"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Client, Leg, Play, money, money0, shortDate } from "@/lib/db";
import { PROMO_FIRST_DAY, PROMO_LAST_DAY, addDays, dayOn, offerBooksOf, toCadencePlay, weekday } from "@/lib/cadence";

// One color per book on the timeline and the books list.
export const BOOK_STYLE: Record<string, { k: string; color: string }> = {
  FanDuel: { k: "F", color: "var(--bk-fd)" },
  DraftKings: { k: "D", color: "var(--bk-dk)" },
  "theScore Bet": { k: "S", color: "var(--bk-tsb)" },
  BetMGM: { k: "M", color: "var(--bk-mgm)" },
};
export const bookStyle = (b: string | null | undefined) => (b && BOOK_STYLE[b]) || { k: "X", color: "var(--bk-other)" };
const BOOK_LIST = ["FanDuel", "DraftKings", "theScore Bet", "BetMGM", "Caesars", "BetRivers", "Bet365", "Fanatics", "Hard Rock"];
const PROMO_WEEKDAYS = new Set([2, 4, 0]);
const MEDIAN_YOURS = 2900;   // median client over ~30 days (AS6 history)

const smsHref = (phone: string | null | undefined, body: string) => {
  let digits = (phone || "").replace(/[^\d+]/g, "");
  if (/^\d{10}$/.test(digits)) digits = `+1${digits}`;
  return `sms:${digits}?&body=${encodeURIComponent(body)}`;
};
const signed = (n: number) => `${n < 0 ? "−" : "+"}${money0(Math.abs(n))}`;

interface Pin { id: string; day: number; x: number; color: string; open: boolean; label: string; amt: string; neg: boolean; row: number; right: boolean; lw: number }

export interface Stats { profit: number; clientShare: number; yours: number; received: number; loan: number; outstanding: number }

export default function ClientOverview({ client, plays, legsBy, stats, startedOn, today, onLogPayment, onOpenOnboarding }: {
  client: Client; plays: Play[]; legsBy: Map<string, Leg[]>; stats: Stats; startedOn: string | null; today: string;
  onLogPayment: () => void; onOpenOnboarding: () => void;
}) {
  const counted = useMemo(() => plays.filter(p => p.status !== "void" && p.status !== "sent").map(p => {
    const cp = toCadencePlay({ ...p, legs: legsBy.get(p.id) || [] });
    return { p, cp, books: offerBooksOf(cp) };
  }), [plays, legsBy]);
  const day = startedOn ? dayOn(startedOn, today) : null;
  const first = client.name.split(" ")[0];

  return (
    <>
      <JourneyCard startedOn={startedOn} day={day} counted={counted} today={today} />
      <div className="overview-cards">
        <BooksCard counted={counted} onOpenOnboarding={onOpenOnboarding} />
        <MoneyCard client={client} first={first} stats={stats} day={day} onLogPayment={onLogPayment} />
        <ResultCard first={first} stats={stats} count={counted.length} />
      </div>
    </>
  );
}

// ─── Timeline ─────────────────────────────────────────────────
type Counted = { p: Play; cp: ReturnType<typeof toCadencePlay>; books: string[] };

function JourneyCard({ startedOn, day, counted, today }: { startedOn: string | null; day: number | null; counted: Counted[]; today: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(900);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(es => setW(es[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [startedOn]);

  const layout = useMemo(() => {
    if (!startedOn) return null;
    const dated = counted.filter(c => c.cp.date);
    const maxPin = dated.reduce((m, c) => Math.max(m, dayOn(startedOn, c.cp.date!)), 1);
    const end = Math.max(PROMO_LAST_DAY, Math.min(Math.max(day || 1, maxPin), 90));
    const pad = 10;
    const x = (d: number) => pad + ((Math.min(Math.max(d, 1), end) - 1) / (end - 1)) * (w - 2 * pad);
    const showLabels = w >= 560;

    const pins: Pin[] = dated.map(({ p, cp, books }) => {
      const d = dayOn(startedOn, cp.date!);
      const profit = Number(p.profit) || 0;
      const label = p.promo || books[0] || "Play";
      const amt = p.status === "settled" ? signed(profit) : "open";
      return { id: p.id, day: d, x: x(d), color: bookStyle(books[0]).color, open: p.status === "open", label, amt,
        neg: p.status === "settled" && profit < 0, row: 0, right: false, lw: (label.length + amt.length + 1) * 6.1 + 4 };
    }).sort((a, b) => a.x - b.x || a.label.localeCompare(b.label));

    // Spread labels over three rows so they don't overlap.
    const rowEnd = [-1e9, -1e9, -1e9];
    pins.forEach(pn => {
      pn.right = pn.x + 8 + pn.lw > w;
      const left = pn.right ? pn.x - 8 - pn.lw : pn.x + 8;
      let r = rowEnd.findIndex(e => left > e + 10);
      if (r < 0) r = rowEnd.indexOf(Math.min(...rowEnd));
      pn.row = r; rowEnd[r] = left + pn.lw;
    });

    // $500 promo days (Tue/Thu/Sun, days 8–30): filled once a FanDuel offer is logged that day or the next.
    const fdDays = new Set(counted.filter(c => c.cp.date && c.books.includes("FanDuel")).map(c => dayOn(startedOn, c.cp.date!)));
    const promoDays: { d: number; x: number; hit: boolean; future: boolean }[] = [];
    for (let d = PROMO_FIRST_DAY; d <= PROMO_LAST_DAY; d++) {
      if (!PROMO_WEEKDAYS.has(weekday(addDays(startedOn, d - 1)))) continue;
      promoDays.push({ d, x: x(d), hit: fdDays.has(d) || fdDays.has(d + 1), future: d > (day || 0) });
    }
    const bands = [
      { from: 1, to: 7, label: "Week 1" },
      { from: PROMO_FIRST_DAY, to: PROMO_LAST_DAY, label: "FanDuel promo days · $500 Tue, Thu, Sun" },
      ...(end > PROMO_LAST_DAY ? [{ from: PROMO_LAST_DAY + 1, to: end, label: "Wrap-up" }] : []),
    ].map(b => ({ ...b, left: x(b.from) - (b.from === 1 ? pad : 2), right: x(b.to) + (b.to === end ? pad : -2) }));
    const ticks = [1, 5, 10, 15, 20, 25, 30, ...(end > 30 ? [end] : [])].filter((d, i, a) => d <= end && a.indexOf(d) === i);
    return { pins, promoDays, bands, ticks: ticks.map(d => ({ d, x: x(d) })), todayX: day != null && day >= 1 ? x(day) : null, showLabels, end };
  }, [startedOn, counted, day, w]);

  if (!startedOn || !layout) {
    return (
      <section className="card journey">
        <div className="journey-head">
          <div className="section-title" style={{ fontSize: 15 }}>Not started</div>
          <span className="task-sub">The timeline starts with the first FanDuel bet{counted.length ? ` · ${counted.length} other play${counted.length === 1 ? "" : "s"} so far` : ""}</span>
        </div>
      </section>
    );
  }

  const AXIS = 76;
  const rowY = [40, AXIS + 10, AXIS + 28];
  return (
    <section className="card journey">
      <div className="journey-head">
        <div className="section-title" style={{ fontSize: 15 }}>
          {day! <= PROMO_LAST_DAY ? `Day ${day} of 30` : `Day ${day} · past the 30-day window`}
        </div>
        <span className="task-sub">Every play since the first FanDuel bet on {shortDate(startedOn)}</span>
      </div>
      <div ref={ref} className="journey-track" style={{ height: layout.showLabels ? 150 : 118 }}>
        {layout.bands.map(b => (
          <div key={b.label} className={`journey-band${b.from === PROMO_FIRST_DAY ? " hot" : ""}`} style={{ left: b.left, width: Math.max(0, b.right - b.left) }}>{b.label}</div>
        ))}
        <div className="journey-axis" style={{ top: AXIS }} />
        {layout.promoDays.map(pd => (
          <span key={pd.d} className={`journey-promo${pd.hit ? " hit" : pd.future ? "" : " missed"}`} style={{ left: pd.x, top: AXIS + 1 }}
            title={`Day ${pd.d}: $500 FanDuel promo${pd.hit ? " played" : pd.future ? "" : " (no FanDuel play logged)"}`} />
        ))}
        {layout.todayX != null && (
          <>
            <div className="journey-today" style={{ left: layout.todayX, top: 30, height: (layout.showLabels ? 150 : 118) - 48 }} />
            <span className="journey-today-label" style={{ left: layout.todayX, bottom: 0, ...(layout.todayX < 120 ? { transform: "none", paddingLeft: 6 } : { transform: "translateX(-100%)", paddingRight: 6 }) }}>Today · day {day}</span>
          </>
        )}
        {layout.pins.map(pn => (
          <div key={pn.id}>
            <span className={`journey-dot${pn.open ? " open" : ""}`} style={{ left: pn.x, top: AXIS - 6, borderColor: pn.color, background: pn.open ? "var(--surface)" : pn.color }}
              title={`Day ${pn.day} · ${pn.label} · ${pn.amt}`} />
            {layout.showLabels && (
              <span className="journey-label" style={{ top: rowY[pn.row], ...(pn.right ? { right: `calc(100% - ${pn.x - 8}px)` } : { left: pn.x + 8 }) }}>
                <b>{pn.label}</b> <span className={pn.amt === "open" ? "" : pn.neg ? "neg" : "pos"}>{pn.amt}</span>
              </span>
            )}
          </div>
        ))}
        {layout.ticks.filter(t => layout.todayX == null || Math.abs(t.x - layout.todayX) > 70).map((t, i, all) => (
          <span key={t.d} className="journey-tick" style={{ left: t.x, bottom: 0, transform: t.d === 1 ? "none" : i === all.length - 1 && t.d === layout.end ? "translateX(-100%)" : "translateX(-50%)" }}>Day {t.d}</span>
        ))}
      </div>
      <div className="journey-legend">
        {["FanDuel", "DraftKings", "theScore Bet", "BetMGM"].map(b => (
          <span key={b}><i style={{ background: bookStyle(b).color }} />{b === "theScore Bet" ? "theScore" : b}</span>
        ))}
        <span><i style={{ background: "var(--bk-other)" }} />Other or casino</span>
        <span><i className="ring" />Open bet</span>
        <span><i className="promo" />$500 promo day</span>
      </div>
    </section>
  );
}

// ─── Books ────────────────────────────────────────────────────
function BooksCard({ counted, onOpenOnboarding }: { counted: Counted[]; onOpenOnboarding: () => void }) {
  const rows = BOOK_LIST.map(b => {
    const offers = counted.filter(c => c.books.includes(b));
    const used = counted.filter(c => c.cp.books.includes(b));
    const firstDate = offers.map(c => c.cp.date).filter(Boolean).sort()[0] as string | undefined;
    const note = offers.length
      ? `${offers.length} play${offers.length === 1 ? "" : "s"}${firstDate ? ` · since ${shortDate(firstDate)}` : ""}`
      : used.length ? "Used for hedges only" : "Not done";
    return { b, done: offers.length > 0, used: used.length > 0, note };
  });
  const shown = rows.filter(r => r.done || r.used || ["FanDuel", "DraftKings", "theScore Bet", "BetMGM", "Caesars", "BetRivers"].includes(r.b));
  return (
    <section className="card overview-card">
      <div className="section-title" style={{ fontSize: 15 }}>Books</div>
      {shown.map(r => (
        <div key={r.b} className="book-row">
          <span className={`book-mark${r.done ? " done" : r.used ? " used" : ""}`}>
            {r.done && <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 5.2 4.1 7.3 8 3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>}
          </span>
          <span className="book-name">{r.b === "theScore Bet" ? "theScore" : r.b}</span>
          <span className="task-sub" style={{ flex: 1 }}>{r.note}</span>
          {!r.done && <button className="mini" onClick={onOpenOnboarding}>Send link</button>}
        </div>
      ))}
    </section>
  );
}

// ─── Money ────────────────────────────────────────────────────
function MoneyCard({ client, first, stats, day, onLogPayment }: { client: Client; first: string; stats: Stats; day: number | null; onLogPayment: () => void }) {
  const owes = stats.outstanding;
  const collect = owes > 0.5 && (day == null || day >= PROMO_LAST_DAY);
  const msg = [
    `Hey ${first}, here's where we're at:`,
    `${money(stats.loan)} loan + ${money(stats.yours)} profit share${stats.received > 0.005 ? ` − ${money(stats.received)} already sent` : ""} = ${money(owes)}.`,
    "Send it over whenever you're ready. Thanks!",
  ].join("\n");
  const line = (label: string, value: number, neg?: boolean) => (
    <div className="money-line"><span>{label}</span><span className="num">{neg && value > 0.005 ? `−${money(value)}` : money(value)}</span></div>
  );
  return (
    <section className="card overview-card">
      <div className="section-title" style={{ fontSize: 15 }}>Money</div>
      {line("Loan out", stats.loan)}
      {line("Your share", stats.yours)}
      {line("Received", stats.received, true)}
      <div className="money-line total"><span>{owes >= 0 ? "Owes you" : "You owe"}</span><span className="num">{money(Math.abs(owes))}</span></div>
      <div style={{ display: "flex", gap: 8, marginTop: "auto", flexWrap: "wrap" }}>
        {collect && (
          <a className="btn-primary" style={{ width: "auto", flex: 1, textAlign: "center", padding: "8px 14px" }} href={smsHref(client.phone, msg)}>
            Request {money0(owes)}
          </a>
        )}
        <button className="btn-ghost" style={{ flex: collect ? undefined : 1 }} onClick={onLogPayment}>Log payment</button>
      </div>
    </section>
  );
}

// ─── Result ───────────────────────────────────────────────────
function ResultCard({ first, stats, count }: { first: string; stats: Stats; count: number }) {
  const line = (label: string, value: number) => (
    <div className="money-line"><span>{label}</span><span className="num" style={{ color: label === "Profit" && value < 0 ? "var(--neg)" : undefined }}>{money(value)}</span></div>
  );
  return (
    <section className="card overview-card">
      <div className="section-title" style={{ fontSize: 15 }}>How {first} did</div>
      {line("Profit", stats.profit)}
      {line(`${first}'s share`, stats.clientShare)}
      {line("Your share", stats.yours)}
      <div className="task-sub" style={{ lineHeight: 1.5, paddingTop: 8, borderTop: "1px solid var(--border)", marginTop: "auto" }}>
        {count} play{count === 1 ? "" : "s"} logged. A median client earns you about {money0(MEDIAN_YOURS)} over 30 days.
      </div>
    </section>
  );
}
