"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Client, ClientSummary, fetchAll, getDb, money, money0, shortDate, today } from "@/lib/db";
import { PROMO_LAST_DAY, cadenceFor, toCadencePlay } from "@/lib/cadence";
import type { ClientCadence, PlayLike } from "@/lib/cadence";

type CPlay = PlayLike & { client_id: string; legs?: { book: string | null; side: string; event_time: string | null }[] | null };
interface Row { c: Client; s?: ClientSummary; cad: ClientCadence; owes: number; loan: number; yours: number; received: number; open: number; asked: string | null }

const GAME_LENGTH_H = 3.5;
const METHODS = ["Zelle", "Venmo", "PayPal", "Cash App", "Cash", "Bank transfer", "Other"];
const smsHref = (phone: string | null | undefined, body: string) => {
  let digits = (phone || "").replace(/[^\d+]/g, "");
  if (/^\d{10}$/.test(digits)) digits = `+1${digits}`;
  return `sms:${digits}?&body=${encodeURIComponent(body)}`;
};
const n = (x: any) => Number(x) || 0;
const first = (name: string) => name.split(" ")[0];
/** Referral fee rule (Quinn, Sept 26): $250 each, every 3rd from the same referrer is $500. */
const referralFee = (count: number) => 250 * count + 250 * Math.floor(count / 3);

export default function MoneyPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [sums, setSums] = useState<ClientSummary[]>([]);
  const [plays, setPlays] = useState<CPlay[]>([]);
  const [asked, setAsked] = useState<Map<string, string>>(new Map());
  const [err, setErr] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const t = today();

  const load = useCallback(async () => {
    try {
      const db = await getDb();
      const [cs, su, ps] = await Promise.all([
        fetchAll<Client>((a, b) => db.from("clients").select("id,name,phone,email,state,split,status,referred_by,notes,approved_books").range(a, b)),
        fetchAll<ClientSummary>((a, b) => db.from("client_summary").select("*").range(a, b)),
        fetchAll<CPlay>((a, b) => db.from("plays").select("client_id,status,promo,book,placed_on,legs(book,side,event_time)").neq("status", "void").range(a, b)),
      ]);
      setClients(cs); setSums(su); setPlays(ps);
      try {
        const ms = await fetchAll<{ client_id: string; due_on: string }>((a, b) => db.from("task_marks").select("client_id,due_on").eq("kind", "collect_request").range(a, b));
        const m = new Map<string, string>();
        ms.forEach(x => { if (!m.has(x.client_id) || x.due_on > m.get(x.client_id)!) m.set(x.client_id, x.due_on); });
        setAsked(m);
      } catch { setAsked(new Map()); }
      setLoaded(true);
    } catch (e: any) { setErr(e?.message || String(e)); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const rows = useMemo<Row[]>(() => {
    const sumBy = new Map(sums.map(s => [s.client_id, s]));
    const byClient = new Map<string, ReturnType<typeof toCadencePlay>[]>();
    plays.forEach(p => { const a = byClient.get(p.client_id) || []; a.push(toCadencePlay(p)); byClient.set(p.client_id, a); });
    return clients.map(c => {
      const s = sumBy.get(c.id);
      const loan = n(s?.loan_outstanding), yours = n(s?.your_share), received = n(s?.received);
      return { c, s, cad: cadenceFor(byClient.get(c.id) || [], t), owes: loan + yours - received, loan, yours, received, open: n(s?.open_plays), asked: asked.get(c.id) || null };
    });
  }, [clients, sums, plays, asked, t]);

  // Open plays whose game should be over: they need a result before anything can be collected.
  const needsResult = useMemo(() => {
    const now = Date.now();
    return plays.filter(p => p.status === "open").filter(p => {
      const times = (p.legs || []).map(l => l.event_time).filter(Boolean).map(x => new Date(x as string).getTime());
      const start = times.length ? Math.min(...times) : p.placed_on ? new Date(`${p.placed_on}T23:59:00`).getTime() : null;
      return start != null && now - start > GAME_LENGTH_H * 3600e3;
    }).length;
  }, [plays]);

  const owing = rows.filter(r => r.owes > 0.5);
  const collect = rows.filter(r => r.owes > 0.5 && r.c.status === "active" && (r.cad.lane === "wrap" || r.cad.lane === "quiet" || (r.cad.day != null && r.cad.day >= PROMO_LAST_DAY)))
    .sort((a, b) => b.owes - a.owes);
  const quiet = rows.filter(r => r.owes > 0.5 && r.cad.lane === "quiet");
  const openPlays = plays.filter(p => p.status === "open").length;

  // Referrals, grouped by how "referred by" is written.
  const referrals = useMemo(() => {
    const by = new Map<string, { name: string; spellings: Map<string, number>; clients: Client[] }>();
    clients.forEach(c => {
      const raw = (c.referred_by || "").trim();
      if (!raw) return;
      const key = raw.toLowerCase().replace(/\s+/g, " ");
      const g = by.get(key) || { name: raw, spellings: new Map(), clients: [] };
      g.spellings.set(raw, (g.spellings.get(raw) || 0) + 1);
      g.clients.push(c);
      by.set(key, g);
    });
    return Array.from(by.values()).map(g => ({
      name: Array.from(g.spellings.entries()).sort((a, b) => b[1] - a[1])[0][0],
      clients: g.clients.sort((a, b) => a.name.localeCompare(b.name)),
      fee: referralFee(g.clients.length),
    })).sort((a, b) => b.fee - a.fee || a.name.localeCompare(b.name));
  }, [clients]);

  if (err) return <div className="banner" style={{ color: "var(--neg)" }}>{err}</div>;
  if (!loaded) return <div style={{ color: "var(--muted)", padding: 24 }}>Loading…</div>;

  const sum = (rs: Row[]) => rs.reduce((s, r) => s + r.owes, 0);

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 className="page-title">Money</h1>
          <p className="page-sub">What's owed, who to collect from, and referral fees</p>
        </div>
        <button className="btn-ghost" onClick={load}>Refresh</button>
      </div>

      <div className="kpis">
        <Kpi label="Owed to you" value={money0(sum(owing))} sub={`Loans plus your unpaid share · ${owing.length} client${owing.length === 1 ? "" : "s"}`} />
        <Kpi label="Ready to collect" value={money0(sum(collect))} sub={`${collect.length} client${collect.length === 1 ? "" : "s"} at day 30+ or gone quiet`} />
        <Kpi label="Owed by quiet clients" value={money0(sum(quiet))} sub="No play in 10+ days" hot={quiet.length > 0} />
        <Kpi label="In open bets" value={`${openPlays} play${openPlays === 1 ? "" : "s"}`} sub={needsResult ? `${needsResult} need${needsResult === 1 ? "s" : ""} a result` : "None waiting on a result"} />
      </div>

      <div className="money-grid">
        <section className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div className="collect-head">
            <div className="section-title" style={{ fontSize: 15 }}>Collect</div>
            <span className="task-sub">Day 30+ or gone quiet, biggest first</span>
          </div>
          {collect.length === 0 && <div className="task-sub" style={{ padding: "0 16px 16px" }}>No one to collect from yet.</div>}
          {collect.map(r => <CollectRow key={r.c.id} r={r} t={t} onChanged={load} />)}
          {collect.length > 0 && (
            <div className="collect-foot"><span className="task-sub">{collect.length} client{collect.length === 1 ? "" : "s"}</span><span className="num" style={{ fontWeight: 650 }}>{money(sum(collect))}</span></div>
          )}
        </section>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <section className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
              <div className="section-title" style={{ fontSize: 15 }}>Referral fees</div>
              <span className="task-sub">$250 each · every 3rd $500</span>
            </div>
            <div className="task-sub" style={{ lineHeight: 1.5 }}>
              Counted from "Referred by" on each client. Only owed when the new client had never signed up anywhere, and paid fees aren't tracked yet, so check before paying.
            </div>
            {referrals.length === 0 && <div className="task-sub">No referrals recorded.</div>}
            {referrals.map(g => (
              <div key={g.name} className="ref-row">
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{g.name}</div>
                  <div className="task-sub">{g.clients.length} referral{g.clients.length === 1 ? "" : "s"}: {g.clients.map(c => c.name).join(", ")}</div>
                </div>
                <span className="num" style={{ fontWeight: 600, fontSize: 13 }}>{money0(g.fee)}</span>
              </div>
            ))}
          </section>

          <section className="card" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
              <div className="section-title" style={{ fontSize: 15 }}>Payments inbox</div>
              <span className="status">Not set up</span>
            </div>
            <div className="task-sub" style={{ lineHeight: 1.5 }}>
              Would read the "you got paid" emails from Venmo and PayPal and let you file each one against a client with one tap. It needs access to the inbox those emails go to. Until then, use Log payment.
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, hot }: { label: string; value: string; sub: string; hot?: boolean }) {
  return (
    <div className="kpi" style={{ borderColor: hot ? "var(--warn)" : undefined }}>
      <div className="stat-label">{label}</div>
      <div className="kpi-value">{value}</div>
      <div className="task-sub" style={{ marginTop: 2 }}>{sub}</div>
    </div>
  );
}

function CollectRow({ r, t, onChanged }: { r: Row; t: string; onChanged: () => void }) {
  const [logging, setLogging] = useState(false);
  const [amount, setAmount] = useState(r.owes.toFixed(2));
  const [method, setMethod] = useState("Zelle");
  const [err, setErr] = useState<string | null>(null);
  const [askedOn, setAskedOn] = useState(r.asked);
  const name = first(r.c.name);
  const msg = [
    `Hey ${name}, here's where we're at:`,
    `${money(r.loan)} loan + ${money(r.yours)} profit share${r.received > 0.005 ? ` − ${money(r.received)} already sent` : ""} = ${money(r.owes)}.`,
    "Send it over whenever you're ready. Thanks!",
  ].join("\n");
  const status = r.open > 0 ? { label: `${r.open} bet${r.open === 1 ? "" : "s"} open`, cls: "open" }
    : askedOn ? { label: `Asked ${askedOn === t ? "today" : shortDate(askedOn)}`, cls: "sent" }
    : r.cad.lane === "quiet" ? { label: "Quiet", cls: "lost" }
    : { label: "Not asked", cls: "" };

  const markAsked = () => {
    setAskedOn(t);
    (async () => {
      const db = await getDb();
      await db.from("task_marks").upsert({ client_id: r.c.id, kind: "collect_request", due_on: t, status: "texted", created_at: new Date().toISOString() }, { onConflict: "client_id,kind,due_on" });
    })().catch(() => {});
  };
  const save = async () => {
    const amt = Math.round((parseFloat(amount) || 0) * 100) / 100;
    if (!amt) return;
    try {
      const db = await getDb();
      const { error } = await db.from("settlements").insert({ client_id: r.c.id, amount: amt, date: t, method, notes: "Logged from Money" });
      if (error) throw error;
      setLogging(false); onChanged();
    } catch (e: any) { setErr(e?.message || "Could not save."); }
  };

  return (
    <div className="collect-row">
      <div className="collect-main">
        <Link href={`/clients/${r.c.id}`} style={{ fontWeight: 600 }}>{r.c.name}</Link>
        <span className="task-sub">{r.cad.day != null ? `day ${r.cad.day}` : "not started"}{r.cad.lane === "quiet" && r.cad.quietDays != null ? ` · quiet ${r.cad.quietDays}d` : ""}</span>
      </div>
      <span className="num collect-amt">{money0(r.owes)}</span>
      <span className={`status ${status.cls}`} style={{ justifySelf: "start" }}>{status.label}</span>
      <div className="collect-act">
        {!logging && (
          <>
            <a className="btn-ghost" href={smsHref(r.c.phone, msg)} onClick={markAsked}>Request</a>
            <button className="btn-ghost" onClick={() => setLogging(true)}>Log payment</button>
          </>
        )}
      </div>
      {logging && (
        <div className="collect-log">
          <input className="input num" value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" style={{ width: 120 }} aria-label="Amount received" />
          <select className="input" value={method} onChange={e => setMethod(e.target.value)} style={{ width: 130 }} aria-label="Method">
            {METHODS.map(m => <option key={m}>{m}</option>)}
          </select>
          <button className="btn-primary" style={{ width: "auto", padding: "7px 14px" }} onClick={save}>Save</button>
          <button className="btn-ghost" onClick={() => setLogging(false)}>Cancel</button>
          <span className="task-sub">Logged as a payment received today.</span>
          {err && <span style={{ color: "var(--neg)", fontSize: 12 }}>{err}</span>}
        </div>
      )}
    </div>
  );
}
