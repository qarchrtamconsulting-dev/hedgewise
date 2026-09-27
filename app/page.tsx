"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Client, ClientSummary, Leg, Play, fetchAll, getDb, money, today } from "@/lib/db";
import { settlePlay, Winner } from "@/lib/settle";
import Receipt from "@/components/Receipt";

type PlayRow = Play & { legs: Leg[] };
const GAME_LENGTH_H = 3.5;   // after this long past start, a game counts as finished

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

export default function TodayPage() {
  const [clients, setClients] = useState<Map<string, Client>>(new Map());
  const [open, setOpen] = useState<PlayRow[]>([]);
  const [sent, setSent] = useState<(PlayRow & { created_at?: string })[]>([]);
  const [withdrawals, setWithdrawals] = useState<PlayRow[] | null>([]);
  const [sums, setSums] = useState<ClientSummary[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const db = await getDb();
      const [cs, op, su] = await Promise.all([
        fetchAll<Client>((a, b) => db.from("clients").select("id,name,phone,email,state,split,status,referred_by,notes,approved_books").range(a, b)),
        fetchAll<PlayRow>((a, b) => db.from("plays").select("*, legs(*)").eq("status", "open").range(a, b)),
        fetchAll<ClientSummary>((a, b) => db.from("client_summary").select("*").range(a, b)),
      ]);
      setClients(new Map(cs.map(c => [c.id, c]))); setOpen(op); setSums(su);
      try {
        const st = await fetchAll<PlayRow>((a, b) => db.from("plays").select("*, legs(*)").eq("status", "sent").order("created_at").range(a, b));
        setSent(st);
      } catch { setSent([]); }
      try {
        const wd = await fetchAll<PlayRow>((a, b) => db.from("plays").select("*, legs(*)").in("withdrawal", ["pending", "requested"]).range(a, b));
        setWithdrawals(wd);
      } catch { setWithdrawals(null); }
      setLoaded(true);
    } catch (e: any) {
      const m = e?.message || String(e);
      setErr(/does not exist|schema cache/i.test(m) ? "The tracker tables aren't set up yet. Run supabase/tracker.sql in Supabase." : m);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const now = Date.now();
  const needs = useMemo(() => open.filter(p => { const s = startOf(p); return s && now - s.getTime() > GAME_LENGTH_H * 3600e3; })
    .sort((a, b) => (startOf(a)!.getTime()) - (startOf(b)!.getTime())), [open, now]);
  const upcoming = useMemo(() => open.filter(p => !needs.includes(p))
    .sort((a, b) => (startOf(a)?.getTime() ?? 9e15) - (startOf(b)?.getTime() ?? 9e15)), [open, needs]);
  const ready = useMemo(() => {
    const byId = new Map<string, ClientSummary>(sums.map((s: ClientSummary) => [s.client_id, s]));
    return (Array.from(clients.values()) as Client[]).filter(c => c.status === "active" && !(Number(byId.get(c.id)?.open_plays) > 0))
      .map(c => { const s = byId.get(c.id); const n = (x: any) => Number(x) || 0;
        return { c, last: s?.last_play || null, outstanding: n(s?.loan_outstanding) + n(s?.your_share) - n(s?.received) }; })
      .sort((a, b) => (a.last || "").localeCompare(b.last || ""));
  }, [clients, sums]);

  if (err) return <div className="banner" style={{ color: "var(--neg)" }}>{err}</div>;
  if (!loaded) return <div style={{ color: "var(--muted)", padding: 24 }}>Loading…</div>;

  const wd = withdrawals || [];
  const dateStr = new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 className="page-title">Today</h1>
          <p className="page-sub">{dateStr}</p>
        </div>
        <button className="btn-ghost" onClick={load}>Refresh</button>
      </div>

      <div className="kpis">
        <Count label="Needs a result" n={needs.length} href="#needs" hot={needs.length > 0} />
        <Count label="Withdrawals" n={wd.length} href="#withdraw" hot={wd.length > 0} />
        <Count label="Upcoming" n={upcoming.length} href="#upcoming" />
        <Count label="Ready for next play" n={ready.length} href="#ready" />
      </div>

      {sent.length > 0 && (
        <Section id="confirm" title="Sent, not logged yet" empty="" count={sent.length}>
          {sent.map(p => (
            <Receipt key={p.id} play={p} legs={p.legs} clientName={clients.get(p.client_id)?.name} sentAt={p.created_at}
              onDone={() => setTimeout(load, 1200)} />
          ))}
        </Section>
      )}

      <Section id="needs" title="Needs a result" empty="Nothing waiting on a result." count={needs.length}>
        {needs.map(p => <NeedsResult key={p.id} play={p} client={clients.get(p.client_id)} onDone={load} />)}
      </Section>

      <Section id="withdraw" title="Withdrawals" count={wd.length}
        empty={withdrawals === null ? "Run supabase/today.sql in Supabase to turn on the withdrawal queue." : "No withdrawals to chase."}>
        {wd.map(p => <Withdrawal key={p.id} play={p} client={clients.get(p.client_id)} onDone={load} />)}
      </Section>

      <Section id="upcoming" title="Upcoming" empty="No open plays." count={upcoming.length}>
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

      <Section id="ready" title="Ready for next play" empty="Every active client has a play going." count={ready.length} grid>
        {ready.map(({ c, last, outstanding }) => (
          <div key={c.id} className="task">
            <div className="task-main">
              <div className="task-title"><Link href={`/clients/${c.id}`}>{c.name}</Link>{c.state && <span className="game-chip">{c.state}</span>}</div>
              <div className="task-lines">{last ? `Last play ${last}` : "No plays yet"} · {money(outstanding)} outstanding</div>
            </div>
            <div className="task-actions">
              <Link className="btn-primary" href="/tools" style={{ width: "auto", padding: "7px 14px" }}>Find a game</Link>
            </div>
          </div>
        ))}
      </Section>
    </div>
  );
}

function Count({ label, n, href, hot }: { label: string; n: number; href: string; hot?: boolean }) {
  return (
    <a href={href} className="kpi" style={{ display: "block", borderColor: hot ? "var(--warn)" : undefined }}>
      <div className="stat-label">{label}</div>
      <div className="kpi-value" style={{ color: hot ? "var(--warn)" : "var(--text)" }}>{n}</div>
    </a>
  );
}

function Section({ id, title, count, empty, children, grid }: { id: string; title: string; count: number; empty: string; children: React.ReactNode; grid?: boolean }) {
  return (
    <section id={id} style={{ display: "flex", flexDirection: "column", gap: 8, scrollMarginTop: 70 }}>
      <div className="section-title" style={{ fontSize: 15 }}>{title}{count ? <span style={{ color: "var(--muted)", fontWeight: 400 }}> · {count}</span> : null}</div>
      {count === 0
        ? <div className="card" style={{ color: "var(--muted)", fontSize: 13, borderStyle: "dashed", background: "transparent", boxShadow: "none" }}>{empty}</div>
        : grid ? <div className="task-grid">{children}</div> : children}
    </section>
  );
}

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
