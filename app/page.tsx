"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Client, ClientSummary, Leg, Play, fetchAll, getDb, money, money0, today } from "@/lib/db";
import { settlePlay, Winner } from "@/lib/settle";
import { copyText } from "@/lib/clipboard";
import Receipt from "@/components/Receipt";
import ClientBoard from "@/components/ClientBoard";
import type { BoardGroup, BoardRow } from "@/components/ClientBoard";
import {
  KIND_LABEL, KIND_ORDER, addDays, appsFor, cadenceFor, dayLabel, isZeroOutDay, promoAfter, screenshotText,
  tasksForToday, tasksOn, toCadencePlay, weekOneStep, weekdayName,
} from "@/lib/cadence";
import type { CadencePlay, ClientCadence, Lane, PlayLike, SendKind, Task, TaskKind } from "@/lib/cadence";

type PlayRow = Play & { legs: Leg[] };
type CPlay = PlayLike & { client_id: string };
type MarkStatus = "texted" | "done" | "skipped";
interface Mark { client_id: string; kind: string; due_on: string; status: MarkStatus; created_at: string | null }
interface Entry { c: Client; cad: ClientCadence; plays: CadencePlay[]; tasks: Task[]; owes: number }
type ItemState = MarkStatus | "todo" | "logged";
interface Item { e: Entry; t: Task; key: string; mark?: Mark; state: ItemState }
type OnMark = (items: Item[], status: MarkStatus | null, fromLink?: boolean) => void;

const GAME_LENGTH_H = 3.5;   // after this long past start, a game counts as finished
const keyOf = (clientId: string, kind: string, dueOn: string) => `${clientId}|${kind}|${dueOn}`;

const smsHref = (phone: string | null | undefined, body: string) => {
  let digits = (phone || "").replace(/[^\d+]/g, "");
  if (/^\d{10}$/.test(digits)) digits = `+1${digits}`;
  return `sms:${digits}?&body=${encodeURIComponent(body)}`;
};

function startOf(p: PlayRow): Date | null {
  const t = p.legs.map(l => l.event_time).filter(Boolean).map(s => new Date(s as string).getTime());
  if (t.length) return new Date(Math.min(...t));
  return p.placed_on ? new Date(`${p.placed_on}T23:59:00`) : null;
}
function ago(d: Date) {
  const m = Math.round((Date.now() - d.getTime()) / 60000);
  if (m < 60) return `${m}m ago`;
  if (m < 48 * 60) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 1440)}d ago`;
}
function until(d: Date) {
  const m = Math.round((d.getTime() - Date.now()) / 60000);
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const day = d.toDateString() === new Date().toDateString() ? (d.getHours() >= 17 ? "Tonight" : "Today")
    : d.toDateString() === new Date(Date.now() + 86400000).toDateString() ? "Tomorrow"
    : d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  return { text: `${day} ${time}`, rel: m <= 0 ? "live" : m < 60 ? `in ${m}m` : m < 2880 ? `in ${Math.round(m / 60)}h` : "" };
}
const first = (name: string) => name.split(" ")[0];
const hasInfo = (l: Leg) => !!(l.book || l.selection || Number(l.cash_stake) || Number(l.credit_stake));
const legLine = (l: Leg) => [l.book, l.selection, l.odds].filter(Boolean).join(" · ") + (Number(l.cash_stake) || Number(l.credit_stake) ? ` · ${money(Number(l.cash_stake) || Number(l.credit_stake))}` : "");
const localDay = (iso: string) => { const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const clock = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "");
const wd3 = (iso: string) => dayLabel(iso).slice(0, 3);
const rankOf = (its: Item[]) => Math.min(...its.map(i => KIND_ORDER.indexOf(i.t.kind)));

export default function TodayPage() {
  const [clients, setClients] = useState<Map<string, Client>>(new Map());
  const [open, setOpen] = useState<PlayRow[]>([]);
  const [sent, setSent] = useState<(PlayRow & { created_at?: string })[]>([]);
  const [withdrawals, setWithdrawals] = useState<PlayRow[] | null>([]);
  const [sums, setSums] = useState<ClientSummary[]>([]);
  const [cplays, setCplays] = useState<CPlay[]>([]);
  const [marks, setMarks] = useState<Map<string, Mark> | null>(new Map());
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [stageView, setStageView] = useState<"board" | "lanes">("board");
  const t = today();
  useEffect(() => { try { const v = localStorage.getItem("hw-stage-view"); if (v === "board" || v === "lanes") setStageView(v); } catch {} }, []);
  const pickView = (v: "board" | "lanes") => { setStageView(v); try { localStorage.setItem("hw-stage-view", v); } catch {} };

  const loadMarks = useCallback(async () => {
    try {
      const db = await getDb();
      const ms = await fetchAll<Mark>((a, b) => db.from("task_marks").select("client_id,kind,due_on,status,created_at").gte("due_on", addDays(today(), -60)).range(a, b));
      setMarks(new Map(ms.map(m => [keyOf(m.client_id, m.kind, m.due_on), m])));
    } catch { setMarks(null); }
  }, []);

  const load = useCallback(async () => {
    try {
      const db = await getDb();
      const [cs, op, su, cp] = await Promise.all([
        fetchAll<Client>((a, b) => db.from("clients").select("id,name,phone,email,state,split,status,referred_by,notes,approved_books").range(a, b)),
        fetchAll<PlayRow>((a, b) => db.from("plays").select("*, legs(*)").eq("status", "open").range(a, b)),
        fetchAll<ClientSummary>((a, b) => db.from("client_summary").select("*").range(a, b)),
        fetchAll<CPlay>((a, b) => db.from("plays").select("client_id,status,promo,book,placed_on,legs(book,side,event_time)").neq("status", "void").range(a, b)),
      ]);
      setClients(new Map(cs.map(c => [c.id, c]))); setOpen(op); setSums(su); setCplays(cp);
      try {
        const st = await fetchAll<PlayRow>((a, b) => db.from("plays").select("*, legs(*)").eq("status", "sent").order("created_at").range(a, b));
        setSent(st);
      } catch { setSent([]); }
      try {
        const wd = await fetchAll<PlayRow>((a, b) => db.from("plays").select("*, legs(*)").in("withdrawal", ["pending", "requested"]).range(a, b));
        setWithdrawals(wd);
      } catch { setWithdrawals(null); }
      await loadMarks();
      setLoaded(true);
    } catch (e: any) {
      const m = e?.message || String(e);
      setErr(/does not exist|schema cache/i.test(m) ? "The tracker tables aren't set up yet. Run supabase/tracker.sql in Supabase." : m);
    }
  }, [loadMarks]);
  useEffect(() => { load(); }, [load]);

  // Every active client: where they are in the cadence and what's due today.
  const board = useMemo<Entry[]>(() => {
    const byClient = new Map<string, CadencePlay[]>();
    cplays.forEach(p => { const a = byClient.get(p.client_id) || []; a.push(toCadencePlay(p)); byClient.set(p.client_id, a); });
    const sumBy = new Map<string, ClientSummary>(sums.map(s => [s.client_id, s]));
    const n = (x: any) => Number(x) || 0;
    // Active clients, plus onboarding leads whose first FanDuel bet is already logged.
    return (Array.from(clients.values()) as Client[]).filter(c => c.status === "active" || c.status === "onboarding").map(c => {
      const plays = byClient.get(c.id) || [];
      const cad = cadenceFor(plays, t);
      const s = sumBy.get(c.id);
      return { c, cad, plays, tasks: tasksForToday(cad, plays, t), owes: n(s?.loan_outstanding) + n(s?.your_share) - n(s?.received) };
    }).filter(e => e.c.status === "active" || !!e.cad.startedOn);
  }, [clients, cplays, sums, t]);

  const items = useMemo<Item[]>(() => board.flatMap(e => e.tasks.map(tk => {
    const key = keyOf(e.c.id, tk.kind, tk.dueOn);
    const mark = marks?.get(key);
    return { e, t: tk, key, mark, state: (mark ? mark.status : tk.done ? "logged" : "todo") as ItemState };
  })), [board, marks]);

  // To do: one row per client, highest-priority item first (FanDuel promo day before new apps).
  const rows = useMemo(() => {
    const by = new Map<string, Item[]>();
    items.forEach(i => { if (i.state === "todo") { const a = by.get(i.e.c.id) || []; a.push(i); by.set(i.e.c.id, a); } });
    const late = (its: Item[]) => Math.max(...its.map(i => i.t.lateDays));
    return Array.from(by.values())
      .map(its => its.sort((a, b) => KIND_ORDER.indexOf(a.t.kind) - KIND_ORDER.indexOf(b.t.kind) || b.t.lateDays - a.t.lateDays))
      .sort((a, b) => rankOf(a) - rankOf(b) || late(b) - late(a) || (b[0].e.cad.day || 0) - (a[0].e.cad.day || 0) || a[0].e.c.name.localeCompare(b[0].e.c.name));
  }, [items]);

  const zero = useMemo(() => items.filter(i => i.t.kind === "fd_check_in" && i.t.lateDays === 0)
    .sort((a, b) => (b.e.cad.day || 0) - (a.e.cad.day || 0)), [items]);
  const doneToday = useMemo(() => items.filter(i => i.t.kind !== "fd_check_in" && i.state !== "todo"
    && (i.state === "logged" || (!!i.mark?.created_at && localDay(i.mark.created_at) === t)))
    .sort((a, b) => (b.mark?.created_at || "").localeCompare(a.mark?.created_at || "")), [items, t]);

  const coming = useMemo(() => [1, 2, 3].map(off => {
    const d = addDays(t, off);
    const groups = new Map<TaskKind, { e: Entry; t: Task }[]>();
    board.forEach(e => tasksOn(e.cad, e.plays, d).forEach(tk => {
      if (tk.kind === "tsb_start") return;
      const a = groups.get(tk.kind) || []; a.push({ e, t: tk }); groups.set(tk.kind, a);
    }));
    return { d, groups: KIND_ORDER.filter(k => groups.has(k)).map(k => ({ kind: k, list: groups.get(k)!.sort((a, b) => a.t.day - b.t.day) })) };
  }), [board, t]);

  // First names for compact lists; adds a last initial when two active clients share a first name.
  const shortNames = useMemo(() => {
    const n = new Map<string, number>();
    board.forEach(e => n.set(first(e.c.name), (n.get(first(e.c.name)) || 0) + 1));
    return new Map(board.map(e => {
      const [f, l] = e.c.name.split(" ");
      return [e.c.id, (n.get(f) || 0) > 1 && l ? `${f} ${l[0]}.` : f];
    }));
  }, [board]);

  // Today A board: one row per client with a 30-day track, grouped by stage, promo days first.
  const boardGroups = useMemo<BoardGroup[]>(() => {
    const todoBy = new Map(rows.map(its => [its[0].e.c.id, its]));
    const zeroBy = new Map(zero.map(i => [i.e.c.id, i]));
    const toRow = (e: Entry): BoardRow => {
      const its = todoBy.get(e.c.id) || [];
      const z = zeroBy.get(e.c.id);
      const name = first(e.c.name);
      const sub = [e.c.state, e.cad.day != null ? (e.cad.day < 1 ? `starts ${wd3(e.cad.startedOn!)}` : `day ${e.cad.day}`) : "not started"].filter(Boolean).join(" · ");
      const base = { id: e.c.id, name: e.c.name, sub, cad: e.cad, plays: e.plays, owes: e.owes };
      if (its.length) {
        const top = its[0];
        const texts = its.filter(i => i.t.send);
        const text = texts.length ? screenshotText(appsFor(texts.map(i => i.t.send as SendKind)), name) : "";
        return { ...base,
          next: `${top.t.title}${top.t.lateDays ? ` · from ${wd3(top.t.dueOn)}` : ""}`,
          nextSub: its.length > 1 ? `Also: ${its.slice(1).map(i => i.t.title).join(", ")}` : top.t.detail,
          hot: top.t.kind === "fd_promo" || top.t.kind === "fd_check_in",
          action: texts.length
            ? <a className="btn-primary bd-btn" href={smsHref(e.c.phone, text)} title={text} onClick={() => onMark(texts, "texted", true)}>Text {name}</a>
            : <Link className="btn-ghost bd-btn" href={`/tools?client=${e.c.id}`}>Find a game</Link> };
      }
      if (z && z.state === "texted") {
        return { ...base, next: "FanDuel cash to $0 by midnight", nextSub: "Checked in · confirm when it's $0", hot: true,
          action: <button className="btn-primary bd-btn" onClick={() => onMark([z], "done")}>At $0</button> };
      }
      switch (e.cad.lane) {
        case "promo":
          return { ...base, next: e.cad.nextPromoOn ? `$500 promo ${e.cad.nextPromoOn === t ? "today" : dayLabel(e.cad.nextPromoOn)}` : "No $500 promo left", nextSub: "Nothing due today" };
        case "week1":
          return { ...base, next: (e.cad.day || 0) < 1 ? `Starts ${dayLabel(e.cad.startedOn!)}` : "All set for today", nextSub: (e.cad.day || 0) >= 1 ? `Week 1 · ${weekOneStep(e.cad.day!)}` : undefined };
        case "wrap":
          return { ...base, next: e.owes > 0.5 ? `Collect ${money0(e.owes)}` : "Settled up", nextSub: e.cad.lastPlay ? `Last play ${dayLabel(e.cad.lastPlay)}` : undefined,
            action: e.owes > 0.5 ? <Link className="btn-ghost bd-btn" href="/money">Collect</Link> : undefined };
        case "quiet":
          return { ...base, next: e.cad.lastPlay ? `No play since ${dayLabel(e.cad.lastPlay)}` : "No plays yet", warn: true,
            action: <a className="btn-ghost bd-btn" href={smsHref(e.c.phone, "")}>Text {name}</a> };
        default:
          return { ...base, next: "No FanDuel bet yet", nextSub: "On the Onboarding tab", action: <Link className="btn-ghost bd-btn" href="/onboarding">Onboarding</Link> };
      }
    };
    const G: { lane: Lane; title: string; range: string; rule: string }[] = [
      { lane: "promo", title: "FanDuel promo days", range: "days 8–30", rule: "$0 FanDuel cash before midnight Mon, Wed, Fri → $500 promo the next day" },
      { lane: "week1", title: "Week 1", range: "days 1–7", rule: "Min loss, reward stack, $25 bet match, FanDuel promos · start theScore" },
      { lane: "quiet", title: "Gone quiet", range: "no play in 10+ days", rule: "Stopping before day 21 earns about $580 vs $3,300" },
      { lane: "wrap", title: "Wrap-up", range: "day 31+", rule: "Withdraw, collect, ask for referrals" },
      { lane: "not_started", title: "No FanDuel yet", range: "active, no FanDuel bet", rule: "Handled on the Onboarding tab" },
    ];
    return G.map(g => ({ key: g.lane, title: g.title, range: g.range, rule: g.rule, hot: g.lane === "promo",
      rows: board.filter(e => e.cad.lane === g.lane).sort(laneOrder(g.lane)).map(toRow) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, rows, zero, t]);

  const now = Date.now();
  const needs = useMemo(() => open.filter(p => { const s = startOf(p); return s && now - s.getTime() > GAME_LENGTH_H * 3600e3; })
    .sort((a, b) => (startOf(a)!.getTime()) - (startOf(b)!.getTime())), [open, now]);
  const upcoming = useMemo(() => open.filter(p => !needs.includes(p))
    .sort((a, b) => (startOf(a)?.getTime() ?? 9e15) - (startOf(b)?.getTime() ?? 9e15)), [open, needs]);

  // Checking items off: saved right away; a text link updates the list after Messages opens.
  const onMark: OnMark = (list, status, fromLink) => {
    if (!list.length) return;
    const at = new Date().toISOString();
    const rowsOut = list.map(i => ({ client_id: i.e.c.id, kind: i.t.kind, due_on: i.t.dueOn }));
    const apply = () => setMarks(prev => {
      const m = new Map(prev || []);
      rowsOut.forEach(r => { const k = keyOf(r.client_id, r.kind, r.due_on); if (status) m.set(k, { ...r, status, created_at: at }); else m.delete(k); });
      return m;
    });
    if (fromLink) setTimeout(apply, 0); else apply();
    setNote(null);
    (async () => {
      const db = await getDb();
      if (status) {
        const { error } = await db.from("task_marks").upsert(rowsOut.map(r => ({ ...r, status, created_at: at })), { onConflict: "client_id,kind,due_on" });
        if (error) throw error;
      } else {
        for (const r of rowsOut) {
          const { error } = await db.from("task_marks").delete().eq("client_id", r.client_id).eq("kind", r.kind).eq("due_on", r.due_on);
          if (error) throw error;
        }
      }
    })().catch((e: any) => { setNote(`Couldn't save that: ${e?.message || "database error"}`); loadMarks(); });
  };

  if (err) return <div className="banner" style={{ color: "var(--neg)" }}>{err}</div>;
  if (!loaded) return <div style={{ color: "var(--muted)", padding: 24 }}>Loading…</div>;

  const wd = withdrawals || [];
  const dateStr = new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
  const zeroDone = zero.filter(i => i.state === "done").length;
  const zeroOut = isZeroOutDay(t) && zero.length > 0;
  const promoToday = items.filter(i => i.t.kind === "fd_promo" && i.t.lateDays === 0).length;
  const nextPromo = coming.find(x => x.groups.some(g => g.kind === "fd_promo"));
  const noPhone = rows.filter(its => its.some(i => i.t.send) && !its[0].e.c.phone).length;

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 className="page-title">Today</h1>
          <p className="page-sub">{dateStr} · {board.length} active client{board.length === 1 ? "" : "s"}</p>
        </div>
        <button className="btn-ghost" onClick={load}>Refresh</button>
      </div>

      <div className="kpis">
        <Count label="To do" n={rows.length} href="#todo" />
        {zeroOut
          ? <Count label="At $0 tonight" n={`${zeroDone} of ${zero.length}`} href="#zero" hot={zeroDone < zero.length} />
          : promoToday > 0
            ? <Count label="$500 promos today" n={promoToday} href="#todo" />
            : <Count label={nextPromo ? `$500 promos ${wd3(nextPromo.d)}` : "$500 promos"} n={nextPromo ? nextPromo.groups.find(g => g.kind === "fd_promo")!.list.length : 0} href="#coming" />}
        <Count label="Needs a result" n={needs.length} href="#needs" hot={needs.length > 0} />
        <Count label="Withdrawals" n={wd.length} href="#withdraw" hot={wd.length > 0} />
      </div>

      {sent.length > 0 && (
        <Section id="confirm" title="Sent, not logged yet" empty="" count={sent.length}>
          {sent.map(p => (
            <Receipt key={p.id} play={p} legs={p.legs} clientName={clients.get(p.client_id)?.name} sentAt={p.created_at}
              onDone={() => setTimeout(load, 1200)} />
          ))}
        </Section>
      )}

      <Section id="todo" title="To do" count={rows.length} empty="All caught up for today."
        sub="Texting checks items off. A logged FanDuel play clears FanDuel items on its own.">
        {marks === null && <div className="banner">Run supabase/checklist.sql in Supabase to save check-offs.</div>}
        {note && <div className="banner" style={{ color: "var(--neg)" }}>{note}</div>}
        {noPhone > 0 && (
          <div className="task-sub">
            {noPhone === rows.length ? "None of these clients have a phone number saved" : `${noPhone} of these clients ${noPhone === 1 ? "has" : "have"} no phone number saved`}, so Text opens Messages without a recipient. Add numbers on their client pages.
          </div>
        )}
        {rows.map(its => <CheckRow key={its[0].e.c.id} its={its} onMark={onMark} />)}
      </Section>

      {zero.length > 0 && <ZeroOut zero={zero} done={zeroDone} t={t} onMark={onMark} />}

      {doneToday.length > 0 && (
        <Section id="done" title="Done today" count={doneToday.length} empty="">
          <div className="done-list">
            {doneToday.map(i => <DoneRow key={i.key} i={i} onMark={onMark} />)}
          </div>
        </Section>
      )}

      <Section id="needs" title="Needs a result" empty="Nothing waiting on a result." count={needs.length}>
        {needs.map(p => <NeedsResult key={p.id} play={p} client={clients.get(p.client_id)} onDone={load} />)}
      </Section>

      <Section id="withdraw" title="Withdrawals" count={wd.length}
        empty={withdrawals === null ? "Run supabase/today.sql in Supabase to turn on the withdrawal queue." : "No withdrawals to chase."}>
        {wd.map(p => <Withdrawal key={p.id} play={p} client={clients.get(p.client_id)} onDone={load} />)}
      </Section>

      <Section id="coming" title="Coming up" count={0} empty="" always>
        <div className="coming">
          {coming.map(({ d, groups }) => (
            <div key={d} className="card coming-day">
              <div className="coming-head">
                <span className="section-title">{dayLabel(d)}</span>
                {isZeroOutDay(d) && groups.some(g => g.kind === "fd_check_in") && <span className="status sent">$0 by midnight</span>}
              </div>
              {groups.length === 0 && <div className="task-sub">Nothing scheduled.</div>}
              {groups.map(g => (
                <div key={g.kind} className="coming-row">
                  <div className="coming-kind">{KIND_LABEL[g.kind]} <span className="task-sub">· {g.list.length}</span></div>
                  <div className="coming-names">
                    {g.list.map(({ e, t: tk }) => (
                      <span key={e.c.id} className="name-chip">
                        <Link href={`/clients/${e.c.id}`}>{shortNames.get(e.c.id) || e.c.name}</Link>{tk.day > 0 && <span className="task-sub"> day {tk.day}</span>}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </Section>

      <Section id="upcoming" title="Upcoming games" empty="No open plays." count={upcoming.length}>
        {upcoming.map(p => {
          const c = clients.get(p.client_id); const s = startOf(p); const u = s ? until(s) : null;
          const pair = p.legs.filter(l => l.seq === 1 && hasInfo(l));
          return (
            <div key={p.id} className="task">
              <div className="task-main">
                <div className="task-title"><Link href={`/clients/${p.client_id}`}>{c?.name || "Client"}</Link><span className="task-sub">{p.promo}</span></div>
                <div className="task-lines">{pair.map(l => <div key={l.id}>{l.side === "promo" ? "Bet" : l.self_hedge ? "Hedge (you)" : "Hedge"}: {legLine(l)}</div>)}</div>
              </div>
              <div className="task-side">
                {u ? <><div className="num" style={{ fontWeight: 600 }}>{u.text}</div>{u.rel && <div className={u.rel === "live" ? "game-soon" : "task-sub"}>{u.rel}</div>}</> : <div className="task-sub">No game time</div>}
              </div>
            </div>
          );
        })}
      </Section>

      <section id="stages" style={{ display: "flex", flexDirection: "column", gap: 10, scrollMarginTop: 70 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div className="section-title" style={{ fontSize: 15 }}>Clients by stage</div>
          <div className="tab-bar">
            <button className={`tab${stageView === "board" ? " active" : ""}`} onClick={() => pickView("board")}>Board</button>
            <button className={`tab${stageView === "lanes" ? " active" : ""}`} onClick={() => pickView("lanes")}>Lanes</button>
          </div>
        </div>
        {stageView === "board" ? <ClientBoard groups={boardGroups} /> : <Lanes board={board} t={t} />}
      </section>
    </div>
  );
}

function Count({ label, n, href, hot }: { label: string; n: number | string; href: string; hot?: boolean }) {
  return (
    <a href={href} className="kpi" style={{ display: "block", borderColor: hot ? "var(--warn)" : undefined }}>
      <div className="stat-label">{label}</div>
      <div className="kpi-value" style={{ color: hot ? "var(--warn)" : "var(--text)" }}>{n}</div>
    </a>
  );
}

function Section({ id, title, count, empty, children, grid, sub, always }: {
  id: string; title: string; count: number; empty: string; children: React.ReactNode; grid?: boolean; sub?: string; always?: boolean;
}) {
  return (
    <section id={id} style={{ display: "flex", flexDirection: "column", gap: 8, scrollMarginTop: 70 }}>
      <div>
        <div className="section-title" style={{ fontSize: 15 }}>{title}{count ? <span style={{ color: "var(--muted)", fontWeight: 400 }}> · {count}</span> : null}</div>
        {sub && <div className="task-sub" style={{ marginTop: 2 }}>{sub}</div>}
      </div>
      {count === 0 && !always
        ? <>{empty && <div className="card" style={{ color: "var(--muted)", fontSize: 13, borderStyle: "dashed", background: "transparent", boxShadow: "none" }}>{empty}</div>}{children}</>
        : grid ? <div className="task-grid">{children}</div> : children}
    </section>
  );
}

// ─── Checklist ────────────────────────────────────────────────
function CheckRow({ its, onMark }: { its: Item[]; onMark: OnMark }) {
  const { c, cad } = its[0].e;
  const texts = its.filter(i => i.t.send);
  const plays = its.filter(i => !i.t.send);
  const text = texts.length ? screenshotText(appsFor(texts.map(i => i.t.send as SendKind)), first(c.name)) : "";
  const promoDay = its.some(i => i.t.kind === "fd_promo" || i.t.kind === "fd_check_in");
  return (
    <div className="check-row">
      <div className="check-main">
        <div className="task-title">
          {promoDay && <span className="dot" title="FanDuel promo day" />}
          <Link href={`/clients/${c.id}`}>{c.name}</Link>
          {cad.day != null && <span className="task-sub">day {cad.day}</span>}
          {c.state && <span className="game-chip">{c.state}</span>}
        </div>
        <div className="check-items">
          {its.map(i => (
            <div key={i.key} className="check-item">
              <div className="check-what">
                <span className="check-title">{i.t.title}</span>
                <span className="task-sub"> · {i.t.detail}</span>
                {i.t.lateDays > 0 && <span className="warn" style={{ fontSize: 12 }}> · from {wd3(i.t.dueOn)}</span>}
              </div>
              <div className="check-mini">
                {i.t.kind !== "fd_check_in" && <button className="mini" onClick={() => onMark([i], "done")}>Done</button>}
                <button className="mini" onClick={() => onMark([i], "skipped")}>Skip</button>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="task-actions">
        {texts.length > 0 && (
          <a className="btn-primary" style={{ width: "auto", padding: "7px 14px", display: "inline-block" }} title={text}
             href={smsHref(c.phone, text)} onClick={() => onMark(texts, "texted", true)}>
            Text {first(c.name)}
          </a>
        )}
        {texts.length > 0 && <button className="btn-ghost" onClick={() => { void copyText(text); onMark(texts, "texted"); }}>Copy</button>}
        {plays.length > 0 && <Link className="btn-ghost" href={`/tools?client=${c.id}`}>Find a game</Link>}
      </div>
    </div>
  );
}

function ZeroOut({ zero, done, t, onMark }: { zero: Item[]; done: number; t: string; onMark: OnMark }) {
  const promoOn = promoAfter(t);
  return (
    <Section id="zero" title="FanDuel cash to $0 by midnight" count={zero.length} empty=""
      sub={`Withdrawal settled and $0 cash tonight sets up ${promoOn ? `${weekdayName(promoOn)}'s` : "the next"} $500 promo.`}>
      <div className="card zero">
        <div className="zero-head">
          <span className="num" style={{ fontWeight: 600 }}>{done} of {zero.length} at $0</span>
        </div>
        <div className="progress"><div style={{ width: `${zero.length ? (done / zero.length) * 100 : 0}%` }} /></div>
        <div className="zero-list">
          {zero.map(i => {
            const label = i.state === "done" ? `At $0${i.mark?.created_at ? ` · ${clock(i.mark.created_at)}` : ""}`
              : i.state === "texted" ? `Texted${i.mark?.created_at ? ` ${clock(i.mark.created_at)}` : ""}`
              : i.state === "skipped" ? "Skipped" : "Not texted";
            return (
              <div key={i.key} className="zero-row">
                <div className="zero-name">
                  <Link href={`/clients/${i.e.c.id}`}>{i.e.c.name}</Link>
                  <span className="task-sub">day {i.t.day}</span>
                </div>
                <span className={`status ${i.state === "done" ? "settled" : i.state === "texted" ? "sent" : ""}`}>{label}</span>
                <div className="zero-act">
                  {i.state === "done"
                    ? <button className="mini" onClick={() => onMark([i], "texted")}>Undo</button>
                    : <>
                        <button className="pick" onClick={() => onMark([i], "done")}>At $0</button>
                        {i.state !== "todo" && <button className="mini" onClick={() => onMark([i], null)}>Undo</button>}
                      </>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Section>
  );
}

function DoneRow({ i, onMark }: { i: Item; onMark: OnMark }) {
  const label = i.state === "texted" ? `Texted ${clock(i.mark?.created_at || null)}`
    : i.state === "done" ? `Done ${clock(i.mark?.created_at || null)}`
    : i.state === "skipped" ? "Skipped" : "Logged";
  return (
    <div className="done-row">
      <Link href={`/clients/${i.e.c.id}`} style={{ fontWeight: 500 }}>{i.e.c.name}</Link>
      <span className="task-sub" style={{ flex: 1, minWidth: 140 }}>{i.t.title}{i.t.lateDays > 0 ? ` · from ${wd3(i.t.dueOn)}` : ""}</span>
      <span className={`status ${i.state === "skipped" ? "void" : i.state === "texted" ? "sent" : "settled"}`}>{label.trim()}</span>
      {i.mark ? <button className="mini" onClick={() => onMark([i], null)}>Undo</button> : <span className="mini" style={{ visibility: "hidden" }}>Undo</span>}
    </div>
  );
}

// ─── Clients by stage ─────────────────────────────────────────
const LANES: { lane: Lane; title: string; rule: string }[] = [
  { lane: "week1", title: "Week 1", rule: "Days 1–7 · FanDuel sequence, start theScore" },
  { lane: "promo", title: "FanDuel promo days", rule: "Days 8–30 · $500 promo Tue, Thu, Sun" },
  { lane: "wrap", title: "Wrap-up", rule: "Day 31+ · collect, ask for referrals" },
  { lane: "quiet", title: "Gone quiet", rule: "No play in 10+ days" },
  { lane: "not_started", title: "No FanDuel yet", rule: "Active, no FanDuel bet logged" },
];

function Lanes({ board, t }: { board: Entry[]; t: string }) {
  const meta = (e: Entry) => {
    const { cad } = e;
    if (cad.lane === "week1" && (cad.day || 0) < 1) return `starts ${dayLabel(cad.startedOn!)}`;
    if (cad.lane === "week1") return `day ${cad.day} · ${weekOneStep(cad.day!)}${cad.theScoreFirst ? "" : " · no theScore yet"}`;
    if (cad.lane === "promo") return `day ${cad.day}${cad.nextPromoOn ? ` · $500 ${cad.nextPromoOn === t ? "today" : wd3(cad.nextPromoOn)}` : " · no $500 promo left"}`;
    if (cad.lane === "wrap") return `day ${cad.day} · owes ${money0(e.owes)}`;
    if (cad.lane === "quiet") return `quiet ${cad.quietDays}d · owes ${money0(e.owes)}`;
    if (cad.lastPlay) return `last play ${dayLabel(cad.lastPlay)}`;
    return e.plays.length ? `${e.plays.length} play${e.plays.length === 1 ? "" : "s"}, none on FanDuel` : "no plays yet";
  };
  return (
      <div className="lanes">
        {LANES.map(({ lane, title, rule }) => {
          const list = board.filter(e => e.cad.lane === lane).sort(laneOrder(lane));
          if (!list.length && lane === "not_started") return null;
          return (
            <div key={lane} className={`lane${lane === "promo" ? " hot" : ""}`}>
              <div>
                <div className="lane-title">{title} <span className="task-sub">· {list.length}</span></div>
                <div className="task-sub">{rule}</div>
              </div>
              {list.length === 0 && <div className="task-sub">No one here.</div>}
              {list.map(e => (
                <div key={e.c.id} className="lane-client">
                  <Link href={`/clients/${e.c.id}`}>{e.c.name}</Link>
                  <span className="task-sub">{meta(e)}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
  );
}

/** Order inside a stage: biggest balance first in wrap-up, longest silence first when quiet, else by day. */
function laneOrder(lane: Lane) {
  return (a: Entry, b: Entry) =>
    lane === "wrap" ? b.owes - a.owes
    : lane === "quiet" ? (b.cad.quietDays || 0) - (a.cad.quietDays || 0)
    : lane === "not_started" ? a.c.name.localeCompare(b.c.name)
    : (a.cad.day || 0) - (b.cad.day || 0);
}

// ─── Results and withdrawals ──────────────────────────────────
function NeedsResult({ play, client, onDone }: { play: PlayRow; client?: Client; onDone: () => void }) {
  const seqs = Array.from(new Set(play.legs.map(l => l.seq))).sort((a, b) => a - b);
  const [picks, setPicks] = useState<Record<number, Winner>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const s = startOf(play);

  const settle = async (w: Record<number, Winner>) => {
    setBusy(true); setErr(null);
    try { await settlePlay(await getDb(), play, play.legs, w); onDone(); }
    catch (e: any) { setErr(e?.message || "Could not settle."); setBusy(false); }
  };
  const choose = (seq: number, w: Winner) => {
    const next = { ...picks, [seq]: w };
    setPicks(next);
    if (seqs.every(q => next[q])) settle(next);        // settles as soon as every pair has a winner
  };

  return (
    <div className="task">
      <div className="task-main">
        <div className="task-title"><Link href={`/clients/${play.client_id}`}>{client?.name || "Client"}</Link><span className="task-sub">{play.promo}{s ? ` · started ${ago(s)}` : ""}</span></div>
        {seqs.length === 0 && <div className="task-lines">No bets recorded. <Link className="link" href={`/clients/${play.client_id}`}>Settle on the client page</Link></div>}
        {seqs.map(q => {
          const promo = play.legs.find(l => l.seq === q && l.side === "promo");
          const hedges = play.legs.filter(l => l.seq === q && l.side === "hedge");
          const opt = (w: Winner, label: string) => (
            <button key={w} className={`pick${picks[q] === w ? " on" : ""}`} disabled={busy} onClick={() => choose(q, w)}>{label}</button>
          );
          return (
            <div key={q} className="task-pair">
              <div className="task-lines">
                {promo && hasInfo(promo) && <div>Bet: {legLine(promo)}</div>}
                {hedges.filter(hasInfo).map(h => <div key={h.id}>{h.self_hedge ? "Hedge (you)" : "Hedge"}: {legLine(h)}</div>)}
              </div>
              <div className="pick-row">
                <span className="task-sub">{seqs.length > 1 ? `Pair ${q}:` : "Winner:"}</span>
                {opt("promo", `${promo?.selection || "Bet"} won`)}
                {opt("hedge", `${hedges[0]?.selection || "Hedge"} won`)}
                {opt("void", "Void")}
              </div>
            </div>
          );
        })}
        {err && <div style={{ color: "var(--neg)", fontSize: 12 }}>{err}</div>}
      </div>
    </div>
  );
}

function Withdrawal({ play, client, onDone }: { play: PlayRow; client?: Client; onDone: () => void }) {
  const wins = play.legs.filter(l => l.result === "won" && !l.self_hedge && Number(l.payout) > 0);
  const total = Number(play.withdrawal_amount) || wins.reduce((t, l) => t + Number(l.payout), 0);
  const [receiving, setReceiving] = useState(false);
  const [amount, setAmount] = useState(total.toFixed(2));
  const [err, setErr] = useState<string | null>(null);
  const name = client ? first(client.name) : "there";
  const msg = [`Hey ${name}, ${play.promo ? `the ${play.promo} play` : "your play"} settled.`, "",
    ...wins.map(l => `Please withdraw ${money(l.payout)} from ${l.book}${l.selection ? ` (${l.selection} won)` : ""}.`),
    "", "Send it over once it lands. Thanks!"].join("\n");

  const set = async (patch: any) => {
    const db = await getDb();
    const { error } = await db.from("plays").update({ ...patch, withdrawal_updated_at: new Date().toISOString() }).eq("id", play.id);
    if (error) throw error;
  };
  const received = async () => {
    const amt = parseFloat(amount);
    if (!amt) return;
    try {
      const db = await getDb();
      const { error } = await db.from("capital_movements").insert({
        client_id: play.client_id, play_id: play.id, type: "received_from_client", amount: Math.round(amt * 100) / 100,
        date: today(), notes: `Withdrawal from ${wins.map(l => l.book).join(" + ") || "book"}${play.promo ? ` (${play.promo})` : ""}`,
      });
      if (error) throw error;
      await set({ withdrawal: "received" });
      onDone();
    } catch (e: any) { setErr(e?.message || "Could not save."); }
  };

  const since = play.withdrawal_updated_at ? ago(new Date(play.withdrawal_updated_at)) : "";
  return (
    <div className="task">
      <div className="task-main">
        <div className="task-title">
          <Link href={`/clients/${play.client_id}`}>{client?.name || "Client"}</Link>
          <span className={`status ${play.withdrawal === "requested" ? "pending" : "open"}`}>{play.withdrawal === "requested" ? `Asked ${since}` : "Not asked yet"}</span>
        </div>
        <div className="task-lines">
          {wins.map(l => <div key={l.id}>Withdraw <b className="num">{money(l.payout)}</b> from {l.book}{l.selection ? ` · ${l.selection} won` : ""}</div>)}
          <div className="task-sub">{play.promo}{play.settled_on ? ` · settled ${play.settled_on}` : ""}</div>
        </div>
        {receiving && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
            <span className="task-sub">Amount received</span>
            <input className="input num" value={amount} onChange={e => setAmount(e.target.value)} style={{ width: 130 }} inputMode="decimal" />
            <button className="btn-primary" style={{ width: "auto", padding: "7px 14px" }} onClick={received}>Save</button>
            <button className="btn-ghost" onClick={() => setReceiving(false)}>Cancel</button>
            <span className="task-sub">Comes off {client ? first(client.name) : "their"} loan.</span>
          </div>
        )}
        {err && <div style={{ color: "var(--neg)", fontSize: 12 }}>{err}</div>}
      </div>
      {!receiving && (
        <div className="task-actions">
          <a className="btn-primary" style={{ width: "auto", padding: "7px 14px", display: "inline-block" }} href={smsHref(client?.phone, msg)}
             onClick={() => { set({ withdrawal: "requested" }).then(onDone).catch(() => {}); }}>
            Text {client ? first(client.name) : "client"}
          </a>
          <button className="btn-ghost" onClick={() => setReceiving(true)}>Received</button>
          <button className="btn-ghost" onClick={() => set({ withdrawal: "skipped" }).then(onDone).catch(() => {})}>Skip</button>
        </div>
      )}
    </div>
  );
}
