"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Client, ClientSummary, Leg, Play, fetchAll, getDb, money, money0, today } from "@/lib/db";
import { isRiskFree, settlePlay, waitingOnSecondLeg, Winner } from "@/lib/settle";
import { toDec } from "@/lib/constants";
import { copyText } from "@/lib/clipboard";
import { GAMES_EVENT, GRADED_EVENT, autoGrade, lastGames, lastScheduledCheck } from "@/lib/autograde";
import type { GameStatus } from "@/lib/autograde";
import { needingResult } from "@/lib/grade-run";
import Receipt from "@/components/Receipt";
import { canDelete, deletePlay, setPlayStatus } from "@/lib/playActions";
import ClientBoard from "@/components/ClientBoard";
import type { BoardGroup, BoardRow } from "@/components/ClientBoard";
import {
  KIND_LABEL, KIND_ORDER, addDays, appsFor, cadenceFor, dayLabel, isCheckInDay, promoAfter, screenshotText,
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
const localMs = (s: string) => new Date(s).getTime();
const matchup = (p: PlayRow) => {
  const sel = (side: string) => p.legs.find(l => l.seq === 1 && l.side === side)?.selection;
  return [sel("promo"), sel("hedge")].filter(Boolean).join(" vs ");
};
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
  return { text: `${day} ${time}`, rel: m <= 0 ? `In progress · ${Math.floor(-m / 60)}h ${-m % 60}m in` : m < 60 ? `in ${m}m` : m < 2880 ? `in ${Math.round(m / 60)}h` : "" };
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
  const [grades, setGrades] = useState<{ play_id: string; client_id: string; graded_at: string; summary: string | null; promo: string | null }[]>([]);
  const [gradeMsg, setGradeMsg] = useState<string | null>(null);
  const [grading, setGrading] = useState(false);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [games, setGames] = useState<Map<string, GameStatus> | null>(() => lastGames()?.status || null);
  const [, setTick] = useState(0);
  const t = today();
  useEffect(() => { try { const v = localStorage.getItem("hw-stage-view"); if (v === "board" || v === "lanes") setStageView(v); } catch {} }, []);
  const pickView = (v: "board" | "lanes") => { setStageView(v); try { localStorage.setItem("hw-stage-view", v); } catch {} };

  // Game statuses come from the background check (components/AuthGate); a minute tick keeps times current.
  useEffect(() => {
    const f = () => setGames(lastGames()?.status || null);
    f();
    window.addEventListener(GAMES_EVENT, f);
    const i = setInterval(() => setTick(x => x + 1), 60 * 1000);
    return () => { window.removeEventListener(GAMES_EVENT, f); clearInterval(i); };
  }, []);

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
      try {
        const since = new Date(); since.setHours(0, 0, 0, 0);
        const { data: ag } = await db.from("auto_grades").select("play_id,client_id,graded_at,summary,plays(promo)")
          .gte("graded_at", since.toISOString()).order("graded_at", { ascending: false });
        setGrades(((ag || []) as any[]).map(r => ({ play_id: r.play_id, client_id: r.client_id, graded_at: r.graded_at, summary: r.summary, promo: (Array.isArray(r.plays) ? r.plays[0]?.promo : r.plays?.promo) ?? null })));
      } catch { setGrades([]); }
      lastScheduledCheck().then(setLastRun);
      await loadMarks();
      setLoaded(true);
    } catch (e: any) {
      const m = e?.message || String(e);
      setErr(/does not exist|schema cache/i.test(m) ? "The tracker tables aren't set up yet. Run supabase/tracker.sql in Supabase." : m);
    }
  }, [loadMarks]);
  useEffect(() => { load(); }, [load]);
  // Reload when finished games were graded in the background.
  useEffect(() => {
    const f = () => load();
    window.addEventListener(GRADED_EVENT, f);
    return () => window.removeEventListener(GRADED_EVENT, f);
  }, [load]);

  const checkScores = async () => {
    setGrading(true); setGradeMsg(null);
    const r = await autoGrade(true);
    setGrading(false);
    if (!r) { setGradeMsg("Already checking. Give it a few seconds."); return; }
    if (r.error) { setGradeMsg(`Couldn't check scores: ${r.error}`); return; }
    const o = Object.values(r.outcomes || {});
    const fin = o.filter(x => x === "final").length, wait = o.filter(x => x === "waiting").length;
    setGradeMsg(r.checked === 0 ? "No open bets with a game underway."
      : [r.graded ? `Graded ${r.graded}` : "", fin ? `${fin} final but need${fin === 1 ? "s" : ""} you (props, or names the scores feed doesn't match)` : "",
        wait ? `${wait} with no final score yet` : ""].filter(Boolean).join(" · ") + ".");
    load();
  };

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

  const now = Date.now();
  // Risk-free bets whose first leg lost stay open until the bonus-bet second leg is logged.
  const waiting = useMemo(() => open.filter(p => waitingOnSecondLeg(p, p.legs)), [open]);
  // Needs a result: the game ended (from the game list), or 3.5 hours passed for bets it can't follow.
  const needs = useMemo(() => needingResult(open, games, localMs, now)
    .sort((a, b) => (startOf(a)!.getTime()) - (startOf(b)!.getTime())), [open, now, games]);
  const live = useMemo(() => open.filter(p => !waiting.includes(p) && !needs.includes(p) && (startOf(p)?.getTime() ?? Infinity) <= now)
    .sort((a, b) => startOf(a)!.getTime() - startOf(b)!.getTime()), [open, waiting, needs, now]);
  const upcoming = useMemo(() => open.filter(p => !needs.includes(p) && !waiting.includes(p))
    .sort((a, b) => (startOf(a)?.getTime() ?? 9e15) - (startOf(b)?.getTime() ?? 9e15)), [open, needs, waiting]);

  // Today A board: one row per client with a 30-day track, grouped by stage, promo days first.
  const boardGroups = useMemo<BoardGroup[]>(() => {
    const todoBy = new Map(rows.map(its => [its[0].e.c.id, its]));
    const openBy = new Map<string, PlayRow[]>();
    open.forEach(p => { const a = openBy.get(p.client_id) || []; a.push(p); openBy.set(p.client_id, a); });
    const betLine = (id: string) => {
      const ps = (openBy.get(id) || []).filter(p => !waitingOnSecondLeg(p, p.legs));
      if (!ps.length) return undefined;
      const p = ps.map(x => ({ x, s: startOf(x) })).sort((a, b) => (a.s?.getTime() ?? 9e15) - (b.s?.getTime() ?? 9e15))[0];
      const when = needs.includes(p.x) ? "game over, needs a result" : p.s ? (p.s.getTime() <= Date.now() ? "game in progress" : `starts ${until(p.s).text}`) : "no game time";
      return `Open bet: ${p.x.promo || "play"} · ${when}${ps.length > 1 ? ` (+${ps.length - 1} more)` : ""}`;
    };
    const toRow = (e: Entry): BoardRow => {
      const its = todoBy.get(e.c.id) || [];
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
      switch (e.cad.lane) {
        case "promo":
          return { ...base, next: e.cad.nextPromoOn ? `$500 promo ${e.cad.nextPromoOn === t ? "today" : dayLabel(e.cad.nextPromoOn)}` : "No $500 promo left", nextSub: betLine(e.c.id) || "Nothing due today" };
        case "week1":
          return { ...base, next: (e.cad.day || 0) < 1 ? `Starts ${dayLabel(e.cad.startedOn!)}` : "All set for today", nextSub: betLine(e.c.id) || ((e.cad.day || 0) >= 1 ? `Week 1 · ${weekOneStep(e.cad.day!)}` : undefined) };
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
      { lane: "promo", title: "FanDuel promo days", range: "days 8–30", rule: "$500 FanDuel promo Tue, Thu, Sun · heads-up and screenshots the day before" },
      { lane: "week1", title: "Week 1", range: "days 1–7", rule: "Min loss, reward stack, $25 bet match, FanDuel promos · start theScore" },
      { lane: "quiet", title: "Gone quiet", range: "no play in 10+ days", rule: "Stopping before day 21 earns about $580 vs $3,300" },
      { lane: "wrap", title: "Wrap-up", range: "day 31+", rule: "Withdraw, collect, ask for referrals" },
      { lane: "not_started", title: "No FanDuel yet", range: "active, no FanDuel bet", rule: "Handled on the Onboarding tab" },
    ];
    return G.map(g => ({ key: g.lane, title: g.title, range: g.range, rule: g.rule, hot: g.lane === "promo",
      rows: board.filter(e => e.cad.lane === g.lane).sort(laneOrder(g.lane)).map(toRow) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, rows, zero, open, needs, t]);


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
  const zeroDone = zero.filter(i => i.state === "done" || i.state === "texted").length;
  const zeroOut = isCheckInDay(t) && zero.length > 0;
  const promoNext = promoAfter(t);
  const promoToday = items.filter(i => i.t.kind === "fd_promo" && i.t.lateDays === 0).length;
  const nextPromo = coming.find(x => x.groups.some(g => g.kind === "fd_promo"));
  const noPhone = rows.filter(its => its.some(i => i.t.send) && !its[0].e.c.phone).length;

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
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
          ? <Count label={`Heads-up for ${promoNext ? wd3(promoNext) : "next"}'s $500`} n={`${zeroDone} of ${zero.length}`} href="#zero" hot={zeroDone < zero.length} />
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

      <Section id="needs" title="Needs a result" empty="Nothing waiting on a result." count={needs.length}
        sub={gradeMsg || `A bet lands here when its game ends, and is graded from the final score within minutes while Hedgewise is open${lastRun && Date.now() - Date.parse(lastRun) < 13 * 3600e3 ? ` · last scheduled check ${clock(lastRun)}` : "."}`}
        action={<button className="btn-ghost" onClick={checkScores} disabled={grading}>{grading ? "Checking…" : "Check scores"}</button>}>
        {needs.map(p => <NeedsResult key={p.id} play={p} client={clients.get(p.client_id)} onDone={load} />)}
        {live.length > 0 && (
          <div className="done-list">
            <div className="task-sub" style={{ padding: "8px 14px" }}>Still playing. {live.length === 1 ? "It moves" : "These move"} here when the game ends.</div>
            {live.map(p => {
              const m = Math.max(0, Math.round((now - startOf(p)!.getTime()) / 60000));
              return (
                <div key={p.id} className="done-row">
                  <Link href={`/clients/${p.client_id}`} style={{ fontWeight: 500 }}>{clients.get(p.client_id)?.name || "Client"}</Link>
                  <span className="task-sub" style={{ flex: 1, minWidth: 160 }}>{[p.promo, matchup(p)].filter(Boolean).join(" · ")}</span>
                  <span className="status open">{games?.get(p.id) === "live" ? "Live" : "In progress"} · {Math.floor(m / 60)}h {m % 60}m in</span>
                </div>
              );
            })}
          </div>
        )}
        {grades.length > 0 && (
          <div className="done-list">
            <div className="task-sub" style={{ padding: "8px 14px" }}>Graded from final scores today. If one is wrong, open the play on the client page and tap Reopen.</div>
            {grades.map(g => (
              <div key={g.play_id} className="done-row">
                <Link href={`/clients/${g.client_id}`} style={{ fontWeight: 500 }}>{clients.get(g.client_id)?.name || "Client"}</Link>
                <span className="task-sub" style={{ flex: 1, minWidth: 160 }}>{g.promo ? `${g.promo} · ` : ""}{g.summary}</span>
                <span className="status settled">Graded {clock(g.graded_at)}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {waiting.length > 0 && (
        <Section id="second-leg" title="Risk-free: second leg to place" count={waiting.length} empty=""
          sub="The first leg lost, so the book owes a bonus bet. These stay open until the second leg is logged and settled.">
          {waiting.map(p => <SecondLeg key={p.id} play={p} client={clients.get(p.client_id)} onDone={load} />)}
        </Section>
      )}

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
                {isCheckInDay(d) && groups.some(g => g.kind === "fd_check_in") && <span className="status sent">Heads-up day</span>}
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

      <Section id="upcoming" title="Open bets" empty="No open plays." count={upcoming.length}
        sub="Games in progress or still to come. A bet moves to Needs a result when its game ends.">
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
                {u ? <><div className="num" style={{ fontWeight: 600 }}>{u.text}</div>{u.rel && <div className={u.rel.startsWith("In progress") ? "game-soon" : "task-sub"}>{u.rel}</div>}</> : <div className="task-sub">No game time</div>}
                <BetMenu play={p} onDone={load} />
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

/** ⋯ on an open bet: void keeps it in history; delete is only for a bet that was never placed. */
function BetMenu({ play, onDone }: { play: PlayRow; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async (f: () => Promise<void>) => {
    setBusy(true); setErr(null);
    try { await f(); setOpen(false); onDone(); } catch (e: any) { setErr(e?.message || "Couldn't save that."); }
    setBusy(false);
  };
  if (!open) return <button className="mini bet-menu-btn" aria-label="Bet options" onClick={() => setOpen(true)}>⋯</button>;
  return (
    <div className="bet-menu">
      <Link className="mini" href={`/clients/${play.client_id}`}>Edit on client</Link>
      <button className="mini" disabled={busy} onClick={() => run(async () => setPlayStatus(await getDb(), play, play.legs, "void"))}>Void</button>
      {canDelete(play) && (confirm
        ? <button className="mini btn-danger" disabled={busy} onClick={() => run(async () => deletePlay(await getDb(), play))}>Yes, delete</button>
        : <button className="mini" onClick={() => setConfirm(true)}>Never placed · delete</button>)}
      <button className="mini" onClick={() => { setOpen(false); setConfirm(false); }}>Close</button>
      {err && <span style={{ color: "var(--neg)", fontSize: 12 }}>{err}</span>}
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

function Section({ id, title, count, empty, children, grid, sub, always, action }: {
  id: string; title: string; count: number; empty: string; children: React.ReactNode; grid?: boolean; sub?: string; always?: boolean; action?: React.ReactNode;
}) {
  return (
    <section id={id} style={{ display: "flex", flexDirection: "column", gap: 8, scrollMarginTop: 70 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div className="section-title" style={{ fontSize: 15 }}>{title}{count ? <span style={{ color: "var(--muted)", fontWeight: 400 }}> · {count}</span> : null}</div>
          {sub && <div className="task-sub" style={{ marginTop: 2 }}>{sub}</div>}
        </div>
        {action}
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
  const day = promoOn ? weekdayName(promoOn) : "the next";
  return (
    <Section id="zero" title={`${day}'s $500 promos · heads-up`} count={zero.length} empty=""
      sub={`Everyone who should see a $500 FanDuel promo ${day === "the next" ? "next" : day}. Text a heads-up and ask for screenshots; texting checks them off.`}
      action={<Link className="btn-ghost" href="/promos">Promo schedule</Link>}>
      <div className="card zero">
        <div className="zero-head">
          <span className="num" style={{ fontWeight: 600 }}>{done} of {zero.length} texted</span>
        </div>
        <div className="progress"><div style={{ width: `${zero.length ? (done / zero.length) * 100 : 0}%` }} /></div>
        <div className="zero-list">
          {zero.map(i => {
            const on = i.state === "done" || i.state === "texted";
            const label = on ? `Texted${i.mark?.created_at ? ` ${clock(i.mark.created_at)}` : ""}` : i.state === "skipped" ? "Skipped" : "Not texted";
            const text = screenshotText(appsFor(["checkin"]), first(i.e.c.name));
            return (
              <div key={i.key} className="zero-row">
                <div className="zero-name">
                  <Link href={`/clients/${i.e.c.id}`}>{i.e.c.name}</Link>
                  <span className="task-sub">day {i.t.day + (promoOn ? Math.round((Date.parse(promoOn) - Date.parse(t)) / 86400000) : 1)} {promoOn ? wd3(promoOn) : ""}</span>
                </div>
                <span className={`status ${on ? "sent" : ""}`}>{label}</span>
                <div className="zero-act">
                  {on || i.state === "skipped"
                    ? <button className="mini" onClick={() => onMark([i], null)}>Undo</button>
                    : <a className="pick" href={smsHref(i.e.c.phone, text)} title={text} onClick={() => onMark([i], "texted", true)}>Text</a>}
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

// ─── Risk-free second leg ─────────────────────────────────────
function SecondLeg({ play, client, onDone }: { play: PlayRow; client?: Client; onDone: () => void }) {
  const firstPromo = play.legs.find(l => l.side === "promo");
  const firstHedge = play.legs.find(l => l.side === "hedge");
  const bonus = Number(firstPromo?.cash_stake) || Number(firstPromo?.credit_stake) || 0;
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    pBook: firstPromo?.book || "", pSel: "", pOdds: "", pAmt: bonus ? String(bonus) : "", pPay: "",
    hBook: firstHedge?.book || "DraftKings", hSel: "", hOdds: "", hCash: "", hPay: "", self: false, when: "",
  });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: any) => setF(x => ({ ...x, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const num = (v: string) => parseFloat(v) || 0;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  // Bonus bet: the stake isn't returned, so it pays stake x (decimal - 1). Hedge pays stake x decimal.
  const pd = toDec(f.pOdds), hd = toDec(f.hOdds);
  const pPay = f.pPay !== "" ? num(f.pPay) : pd ? r2(num(f.pAmt) * (pd - 1)) : 0;
  const hPay = f.hPay !== "" ? num(f.hPay) : hd ? r2(num(f.hCash) * hd) : 0;
  const first = client ? client.name.split(" ")[0] : "them";

  const save = async () => {
    if (!f.pSel.trim() || !f.hSel.trim() || !num(f.pAmt)) { setErr("Add both teams and the bonus amount."); return; }
    setBusy(true); setErr(null);
    try {
      const db = await getDb();
      const event_time = f.when ? `${f.when}:00` : null;
      const rows = [
        { play_id: play.id, seq: 2, side: "promo", book: f.pBook || null, self_hedge: false, selection: f.pSel.trim(), odds: f.pOdds.trim() || null,
          cash_stake: 0, credit_stake: r2(num(f.pAmt)), payout: pPay, result: "pending", event_time },
        { play_id: play.id, seq: 2, side: "hedge", book: f.hBook || null, self_hedge: f.self, selection: f.hSel.trim(), odds: f.hOdds.trim() || null,
          cash_stake: r2(num(f.hCash)), credit_stake: 0, payout: hPay, result: "pending", event_time },
      ];
      const { error } = await db.from("legs").insert(rows);
      if (error) throw error;
      if (f.self && num(f.hCash) > 0) {
        const { error: e2 } = await db.from("capital_movements").insert({ client_id: play.client_id, play_id: play.id, type: "self_hedge_stake",
          amount: r2(num(f.hCash)), date: today(), notes: `Self hedge: ${play.promo || "risk-free"} second leg` });
        if (e2) throw e2;
      }
      onDone();
    } catch (e: any) { setErr(e?.message || "Could not save."); setBusy(false); }
  };

  return (
    <div className="task">
      <div className="task-main">
        <div className="task-title"><Link href={`/clients/${play.client_id}`}>{client?.name || "Client"}</Link><span className="task-sub">{play.promo}</span></div>
        <div className="task-lines">
          First leg lost{firstPromo?.selection ? ` (${firstPromo.selection})` : ""}. Bonus bet of <b className="num">{money(bonus)}</b> on {firstPromo?.book || "the promo book"} to play.
        </div>
        {open && (
          <div className="second-leg">
            <div className="second-leg-row">
              <span className="label">Bonus bet</span>
              <input className="input" placeholder="Book" value={f.pBook} onChange={set("pBook")} />
              <input className="input" placeholder="Team / pick" value={f.pSel} onChange={set("pSel")} />
              <input className="input num" placeholder="Odds +250" value={f.pOdds} onChange={set("pOdds")} />
              <input className="input num" placeholder="Bonus $" value={f.pAmt} onChange={set("pAmt")} inputMode="decimal" />
              <input className="input num" placeholder={`Pays ${pPay ? money(pPay) : "$"}`} value={f.pPay} onChange={set("pPay")} inputMode="decimal" />
            </div>
            <div className="second-leg-row">
              <span className="label">Hedge</span>
              <input className="input" placeholder="Book" value={f.hBook} onChange={set("hBook")} />
              <input className="input" placeholder="Team / pick" value={f.hSel} onChange={set("hSel")} />
              <input className="input num" placeholder="Odds -300" value={f.hOdds} onChange={set("hOdds")} />
              <input className="input num" placeholder="Cash $" value={f.hCash} onChange={set("hCash")} inputMode="decimal" />
              <input className="input num" placeholder={`Pays ${hPay ? money(hPay) : "$"}`} value={f.hPay} onChange={set("hPay")} inputMode="decimal" />
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <input className="input" type="datetime-local" value={f.when} onChange={set("when")} style={{ width: 210 }} aria-label="Game time" />
              <label className="tog"><input type="checkbox" checked={f.self} onChange={set("self")} style={{ accentColor: "var(--accent)" }} /><span className="task-sub">Hedge in my account</span></label>
              <button className="btn-primary" style={{ width: "auto", padding: "7px 14px" }} onClick={save} disabled={busy}>{busy ? "Saving…" : "Save second leg"}</button>
              <button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            </div>
            <div className="task-sub">Both bets go on this play as pair 2. It closes once pair 2 has a result (graded from the final score when it can be).</div>
          </div>
        )}
        {err && <div style={{ color: "var(--neg)", fontSize: 12 }}>{err}</div>}
      </div>
      {!open && (
        <div className="task-actions">
          <Link className="btn-ghost" href={`/tools?tool=freebet&client=${play.client_id}`}>Find a game</Link>
          <button className="btn-primary" style={{ width: "auto", padding: "7px 14px" }} onClick={() => setOpen(true)}>Log second leg</button>
        </div>
      )}
      {!open && <div className="task-sub" style={{ flexBasis: "100%" }}>Find a game to size it, then log it here so it stays on this play{first ? ` for ${first}` : ""}.</div>}
    </div>
  );
}

// ─── Results and withdrawals ──────────────────────────────────
function NeedsResult({ play, client, onDone }: { play: PlayRow; client?: Client; onDone: () => void }) {
  const seqs = Array.from(new Set(play.legs.map(l => l.seq))).sort((a, b) => a - b);
  // Pairs that already have a result (e.g. a risk-free first leg) start filled in.
  const [picks, setPicks] = useState<Record<number, Winner>>(() => {
    const w: Record<number, Winner> = {};
    seqs.forEach(q => {
      const done = play.legs.filter(l => l.seq === q && l.result !== "pending");
      if (!done.length) return;
      w[q] = done.some(l => l.result === "void") ? "void" : done.some(l => l.side === "promo" && l.result === "won") ? "promo" : "hedge";
    });
    return w;
  });
  const riskFree = isRiskFree(play) && seqs.length === 1;
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
        {riskFree && <div className="task-sub">Risk-free: if the promo book loses, it stays open for the bonus-bet second leg.</div>}
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
  // The client cashes out winnings to their own bank; nothing is sent back to you at this step,
  // so marking it withdrawn doesn't touch the loan. (Stored as withdrawal = 'received', meaning done.)
  const wins = play.legs.filter(l => l.result === "won" && !l.self_hedge && Number(l.payout) > 0);
  const [err, setErr] = useState<string | null>(null);
  const name = client ? first(client.name) : "there";
  const msg = [`Hey ${name}, ${play.promo ? `the ${play.promo} play` : "your play"} settled.`, "",
    ...wins.map(l => `Please withdraw ${money(l.payout)} from ${l.book}${l.selection ? ` (${l.selection} won)` : ""}.`),
    "", "Let me know once it's done. Thanks!"].join("\n");

  const set = async (patch: any) => {
    try {
      const db = await getDb();
      const { error } = await db.from("plays").update({ ...patch, withdrawal_updated_at: new Date().toISOString() }).eq("id", play.id);
      if (error) throw error;
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
        {err && <div style={{ color: "var(--neg)", fontSize: 12 }}>{err}</div>}
      </div>
      <div className="task-actions">
        <a className="btn-primary" style={{ width: "auto", padding: "7px 14px", display: "inline-block" }} href={smsHref(client?.phone, msg)}
           onClick={() => { void set({ withdrawal: "requested" }); }}>
          Text {client ? first(client.name) : "client"}
        </a>
        <button className="btn-ghost" onClick={() => set({ withdrawal: "received" })}>Withdrawn</button>
        <button className="btn-ghost" onClick={() => set({ withdrawal: "skipped" })}>Skip</button>
      </div>
    </div>
  );
}
