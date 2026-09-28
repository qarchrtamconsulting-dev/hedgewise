"use client";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { money0, today } from "@/lib/db";
import { getDb } from "@/lib/db";
import { KIND_ORDER, SendKind, appsFor, dayLabel, screenshotText, weekOneStep } from "@/lib/cadence";
import { BOARD_BOOKS, BookCell, OpsEntry, bookCells, bookShort, loadOps, taskBook } from "@/lib/ops";

const first = (name: string) => name.split(" ")[0];
const smsHref = (phone: string | null | undefined, body: string) => {
  let digits = (phone || "").replace(/[^\d+]/g, "");
  if (/^\d{10}$/.test(digits)) digits = `+1${digits}`;
  return `sms:${digits}?&body=${encodeURIComponent(body)}`;
};
const findHref = (clientId: string, book: string) => `/tools?client=${encodeURIComponent(clientId)}&book=${encodeURIComponent(book)}`;
const wd3 = (iso: string) => dayLabel(iso).slice(0, 3);

type Group = "due" | "leads" | "running" | "collect" | "quiet";
const GROUPS: { key: Group; title: string }[] = [
  { key: "due", title: "Due now" },
  { key: "leads", title: "Getting started" },
  { key: "running", title: "Running" },
  { key: "collect", title: "Collect" },
  { key: "quiet", title: "Gone quiet" },
];
const FILTERS: { key: "all" | Group; label: string }[] = [
  { key: "all", label: "All" }, { key: "due", label: "Due now" }, { key: "leads", label: "Getting started" },
  { key: "running", label: "Running" }, { key: "collect", label: "Collect" }, { key: "quiet", label: "Gone quiet" },
];

function groupOf(e: OpsEntry): Group {
  if (e.lead) return "leads";
  if (e.todo.length) return "due";
  if (e.cad.lane === "quiet") return "quiet";
  if (e.collect) return "collect";
  return "running";
}

interface Next { title: string; sub?: string; tone?: "hot" | "warn" }
function nextOf(e: OpsEntry, t: string): Next {
  const openBets = e.raw.filter(p => p.status === "open").length;
  const unconfirmed = e.raw.filter(p => p.status === "sent").length;
  const bets = [openBets ? `${openBets} open bet${openBets === 1 ? "" : "s"}` : "", unconfirmed ? `${unconfirmed} to confirm` : ""].filter(Boolean).join(" · ");
  if (e.lead) return { title: "Finish onboarding", sub: "No FanDuel bet yet" };
  if (e.todo.length) {
    const top = e.todo[0];
    const also = e.todo.slice(1).map(x => x.title).join(", ");
    return {
      title: `${top.title}${top.lateDays ? ` · from ${wd3(top.dueOn)}` : ""}`,
      sub: also ? `Also: ${also}` : bets || top.detail,
      tone: top.kind === "fd_promo" || top.kind === "fd_check_in" ? "hot" : undefined,
    };
  }
  switch (e.cad.lane) {
    case "quiet": return { title: e.cad.lastPlay ? `No play since ${dayLabel(e.cad.lastPlay)}` : "No plays yet", sub: bets || undefined, tone: "warn" };
    case "promo": return { title: e.cad.nextPromoOn ? `$500 promo ${e.cad.nextPromoOn === t ? "today" : wd3(e.cad.nextPromoOn)}` : "No $500 promo left", sub: bets || "Nothing due today" };
    case "week1": return { title: (e.cad.day || 0) < 1 ? `Starts ${dayLabel(e.cad.startedOn!)}` : `Week 1 · ${weekOneStep(e.cad.day!)}`, sub: bets || "Nothing due today" };
    case "wrap": return { title: e.owes > 0.5 ? `Collect ${money0(e.owes)}` : "Settled up", sub: bets || (e.cad.lastPlay ? `Last play ${dayLabel(e.cad.lastPlay)}` : undefined) };
    default: return { title: "—" };
  }
}

const CELL_LABEL: Record<BookCell["state"], (c: BookCell) => string> = {
  open: c => (c.open > 1 ? `${c.open} open` : "open"),
  sent: () => "confirm",
  next: () => "next",
  done: c => (c.offers > 1 ? `✓${c.offers}` : "✓"),
  used: () => "·",
  none: () => "",
};

export default function BoardPage() {
  const t = today();
  const [entries, setEntries] = useState<OpsEntry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | Group>("all");
  const [openCell, setOpenCell] = useState<{ id: string; book: string } | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { entries } = await loadOps(t);
      setEntries(entries);
    } catch (e: any) { setErr(e?.message || String(e)); }
  }, [t]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const f = () => load();
    window.addEventListener("focus", f);
    return () => window.removeEventListener("focus", f);
  }, [load]);

  const rows = useMemo(() => {
    const list = (entries || []).map(e => ({ e, g: groupOf(e), cells: bookCells(e), next: nextOf(e, t) }));
    const rank = (e: OpsEntry) => (e.todo.length ? Math.min(...e.todo.map(x => KIND_ORDER.indexOf(x.kind))) : 99);
    return list.sort((a, b) =>
      GROUPS.findIndex(g => g.key === a.g) - GROUPS.findIndex(g => g.key === b.g)
      || rank(a.e) - rank(b.e)
      || (a.g === "collect" ? b.e.owes - a.e.owes : 0)
      || (b.e.cad.day || 0) - (a.e.cad.day || 0)
      || a.e.c.name.localeCompare(b.e.c.name));
  }, [entries, t]);

  const counts = useMemo(() => {
    const m: Record<string, number> = { all: rows.length };
    rows.forEach(r => { m[r.g] = (m[r.g] || 0) + 1; });
    return m;
  }, [rows]);
  const shown = rows.filter(r => filter === "all" || r.g === filter);
  const totalOwed = (entries || []).reduce((s, e) => s + (e.owes > 0.5 ? e.owes : 0), 0);

  // Texting checks the items off (same as Today): they come back if nothing is logged.
  const markTexted = async (e: OpsEntry, kinds: { kind: string; dueOn: string }[]) => {
    if (!kinds.length) return;
    const at = new Date().toISOString();
    setEntries(prev => prev && prev.map(x => x.c.id !== e.c.id ? x : { ...x, todo: x.todo.filter(tk => !kinds.some(k => k.kind === tk.kind && k.dueOn === tk.dueOn)) }));
    try {
      const db = await getDb();
      const { error } = await db.from("task_marks").upsert(kinds.map(k => ({ client_id: e.c.id, kind: k.kind, due_on: k.dueOn, status: "texted", created_at: at })), { onConflict: "client_id,kind,due_on" });
      if (error) throw error;
      setNote(`Texted ${first(e.c.name)}. Marked on Today.`);
    } catch (x: any) { setNote(`Couldn't save that ${first(e.c.name)} was texted: ${x?.message || "database error"}`); load(); }
  };

  const action = (e: OpsEntry) => {
    const name = first(e.c.name);
    const texts = e.todo.filter(x => x.send);
    if (texts.length) {
      const body = screenshotText(appsFor(texts.map(x => x.send as SendKind)), name);
      return <a className="btn-primary ob-btn" href={smsHref(e.c.phone, body)} title={body}
        onClick={() => { void markTexted(e, texts.map(x => ({ kind: x.kind, dueOn: x.dueOn }))); }}>Text {name}</a>;
    }
    if (e.todo.length) return <Link className="btn-primary ob-btn" href={findHref(e.c.id, taskBook(e.todo[0]))}>Find a game</Link>;
    if (e.lead) return <Link className="btn-ghost ob-btn" href="/onboarding">Onboarding</Link>;
    if (e.cad.lane === "quiet") return <a className="btn-ghost ob-btn" href={smsHref(e.c.phone, "")}>Text {name}</a>;
    if (e.collect) return <Link className="btn-ghost ob-btn" href="/money">Collect</Link>;
    return <Link className="btn-ghost ob-btn" href={findHref(e.c.id, "FanDuel")}>Find a game</Link>;
  };

  if (err) return <div className="card" style={{ color: "var(--neg)" }}>{err}</div>;

  let lastGroup: Group | null = null;
  return (
    <div className="ob">
      <div className="ob-head">
        <div>
          <h1 className="page-title">Board</h1>
          <p className="page-sub">
            {entries ? `${rows.length} clients · ${counts.due || 0} due now · ${money0(totalOwed)} owed to you` : "Loading…"}
          </p>
        </div>
        <div className="ob-filters" role="tablist" aria-label="Show">
          {FILTERS.map(f => (
            <button key={f.key} role="tab" aria-selected={filter === f.key} className={`ob-chip${filter === f.key ? " on" : ""}`} onClick={() => setFilter(f.key)}>
              {f.label}{counts[f.key] ? <span className="ob-chip-n">{counts[f.key]}</span> : null}
            </button>
          ))}
        </div>
      </div>
      {note && <div className="hint" style={{ margin: "0 0 10px" }}>{note}</div>}

      <div className="ob-scroll">
        <div className="ob-grid" role="table" aria-label="Clients by book">
          <div className="ob-row ob-th" role="row">
            <div className="ob-name" role="columnheader">Client</div>
            {BOARD_BOOKS.map(b => <div key={b} className="ob-c" role="columnheader" title={b}>{bookShort(b)}</div>)}
            <div className="ob-owes" role="columnheader">Owes</div>
            <div className="ob-next" role="columnheader">Next</div>
            <div className="ob-act" role="columnheader"><span className="sr-only">Action</span></div>
          </div>

          {!entries && <div className="ob-empty">Loading clients…</div>}
          {entries && shown.length === 0 && <div className="ob-empty">No one here right now.</div>}

          {shown.map(({ e, g, cells, next }) => {
            const header = filter === "all" && g !== lastGroup ? GROUPS.find(x => x.key === g)!.title : null;
            lastGroup = g;
            const sel = openCell?.id === e.c.id ? cells.find(c => c.book === openCell.book) : undefined;
            return (
              <Fragment key={e.c.id}>
                {header && <div className="ob-group" role="row"><span>{header}</span><span className="task-sub">{counts[g]}</span></div>}
                <div className={`ob-row${sel ? " sel" : ""}`} role="row">
                  <div className="ob-name" role="cell">
                    <Link href={`/clients/${e.c.id}`}>{e.c.name}</Link>
                    <span className="task-sub">{[e.c.state, e.cad.day != null ? (e.cad.day < 1 ? "starts soon" : `day ${e.cad.day}`) : "not started"].filter(Boolean).join(" · ")}</span>
                  </div>
                  {cells.map(c => (
                    <div key={c.book} className="ob-c" role="cell">
                      <button className={`ob-cell ${c.state}${sel?.book === c.book ? " picked" : ""}`}
                        aria-label={`${e.c.name}, ${c.book}: ${c.state === "none" ? "nothing yet" : c.state}`}
                        aria-expanded={sel?.book === c.book}
                        onClick={() => setOpenCell(sel?.book === c.book ? null : { id: e.c.id, book: c.book })}>
                        {CELL_LABEL[c.state](c)}
                      </button>
                    </div>
                  ))}
                  <div className="ob-owes num" role="cell">{e.owes > 0.5 ? money0(e.owes) : "—"}</div>
                  <div className={`ob-next${next.tone ? ` ${next.tone}` : ""}`} role="cell">
                    <b>{next.title}</b>
                    {next.sub && <span className="task-sub">{next.sub}</span>}
                  </div>
                  <div className="ob-act" role="cell">{action(e)}</div>
                </div>
                {sel && <CellPanel e={e} cell={sel} onClose={() => setOpenCell(null)} />}
              </Fragment>
            );
          })}
        </div>
      </div>

      <div className="ob-legend">
        <span><i className="ob-key next" />Next up</span>
        <span><i className="ob-key open" />Bet open</span>
        <span><i className="ob-key sent" />Logged, needs confirm</span>
        <span><i className="ob-key done" />Offers played</span>
        <span><i className="ob-key used" />Used for hedges only</span>
        <span>Tap any cell to act on that book</span>
      </div>
    </div>
  );
}

function CellPanel({ e, cell, onClose }: { e: OpsEntry; cell: BookCell; onClose: () => void }) {
  const name = first(e.c.name);
  const app = cell.book === "theScore Bet" ? "theScore" : cell.book;
  const recent = [...cell.plays].sort((a, b) => (b.placed_on || "").localeCompare(a.placed_on || "")).slice(0, 5);
  const due = e.todo.filter(x => taskBook(x) === cell.book);
  return (
    <div className="ob-panel" role="row">
      <div className="ob-panel-in" role="cell">
        <div className="ob-panel-head">
          <div>
            <div style={{ fontWeight: 650 }}>{e.c.name} · {cell.book}</div>
            <div className="task-sub">
              {due.length ? `Due: ${due.map(x => x.title).join(", ")}` : cell.offers ? `${cell.offers} offer${cell.offers === 1 ? "" : "s"} played` : "No offers played here yet"}
              {cell.open ? ` · ${cell.open} open` : ""}{cell.sent ? ` · ${cell.sent} to confirm` : ""}
            </div>
          </div>
          <button className="btn-ghost" onClick={onClose} aria-label="Close">Close</button>
        </div>
        <div className="ob-panel-acts">
          <Link className="btn-primary ob-btn" href={findHref(e.c.id, cell.book)}>Find a game on {bookShort(cell.book)}</Link>
          <a className="btn-ghost ob-btn" href={smsHref(e.c.phone, screenshotText([app], name))}>Ask for {app} screenshot</a>
          <Link className="btn-ghost ob-btn" href={`/clients/${e.c.id}`}>Client page</Link>
        </div>
        {recent.length > 0 && (
          <div className="ob-panel-list">
            {recent.map(p => (
              <div key={p.id} className="ob-panel-play">
                <span>{p.promo || "play"}</span>
                <span className="task-sub">{p.placed_on ? dayLabel(p.placed_on) : "no date"} · {p.status === "sent" ? "needs confirm" : p.status}</span>
              </div>
            ))}
          </div>
        )}
        {!e.c.phone && <div className="task-sub">No phone number saved for {name}, so texts open without a recipient.</div>}
      </div>
    </div>
  );
}
