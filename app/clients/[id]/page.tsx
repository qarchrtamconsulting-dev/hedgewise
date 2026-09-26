"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Client, Leg, MOVE_LABEL, MOVE_SIGN, Movement, MoveType, PLAY_TYPES, Play, Settlement,
  fetchAll, getDb, money, pct, today, tone,
} from "@/lib/db";
import { BOOKS } from "@/lib/constants";

const ALL_BOOKS = [...BOOKS, "theScore Bet", "ESPN Bet"];

const smsHref = (phone: string | null | undefined, body: string) => {
  let digits = (phone || "").replace(/[^\d+]/g, "");
  if (/^\d{10}$/.test(digits)) digits = `+1${digits}`;
  return `sms:${digits}?&body=${encodeURIComponent(body)}`;
};

export default function ClientPage({ params }: { params: { id: string } }) {
  const id = params.id;
  const [client, setClient] = useState<Client | null>(null);
  const [plays, setPlays] = useState<Play[]>([]);
  const [legs, setLegs] = useState<Leg[]>([]);
  const [moves, setMoves] = useState<Movement[]>([]);
  const [setts, setSetts] = useState<Settlement[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<"plays" | "ledger">("plays");
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    try {
      const db = await getDb();
      const [c, p, l, m, s] = await Promise.all([
        db.from("clients").select("*").eq("id", id).single(),
        fetchAll<Play>((a, b) => db.from("play_calc").select("*").eq("client_id", id).order("placed_on", { ascending: false, nullsFirst: false }).range(a, b)),
        fetchAll<Leg>((a, b) => db.from("legs").select("*, plays!inner(client_id)").eq("plays.client_id", id).order("seq").range(a, b)),
        fetchAll<Movement>((a, b) => db.from("capital_movements").select("*").eq("client_id", id).order("date", { ascending: false }).range(a, b)),
        fetchAll<Settlement>((a, b) => db.from("settlements").select("*").eq("client_id", id).order("date", { ascending: false }).range(a, b)),
      ]);
      if (c.error) throw c.error;
      setClient(c.data as Client); setPlays(p); setLegs(l); setMoves(m); setSetts(s);
    } catch (e: any) {
      setErr(e?.message || String(e));
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const legsBy = useMemo(() => {
    const m = new Map<string, Leg[]>();
    legs.forEach(l => { const a = m.get(l.play_id) || []; a.push(l); m.set(l.play_id, a); });
    return m;
  }, [legs]);

  const stats = useMemo(() => {
    let profit = 0, clientShare = 0;
    plays.forEach(p => { if (p.status === "settled") { profit += Number(p.profit) || 0; clientShare += Number(p.client_share) || 0; } });
    const received = setts.reduce((s, x) => s + Number(x.amount), 0);
    const loan = moves.reduce((s, x) => s + MOVE_SIGN[x.type] * Number(x.amount), 0);
    const yours = profit - clientShare;
    return { profit, clientShare, yours, received, balance: yours - received, loan, outstanding: loan + yours - received, open: plays.filter(p => p.status === "open").length };
  }, [plays, setts, moves]);

  if (err) return <div className="banner" style={{ color: "var(--neg)" }}>{err}</div>;
  if (!client) return <div style={{ color: "var(--muted)", padding: 24 }}>Loading…</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <Link href="/clients" className="link" style={{ fontSize: 12 }}>All clients</Link>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap", marginTop: 6 }}>
          <div>
            <h1 className="page-title">{client.name}</h1>
            <p className="page-sub">
              {[client.state, client.phone, client.split != null ? `${pct(client.split)} client split` : null, client.status === "active" ? "Active" : "Inactive"].filter(Boolean).join(" · ") || "No details yet"}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <label className="tog">
              <input type="checkbox" checked={client.status === "active"} onChange={async e => {
                const status = e.target.checked ? "active" : "inactive";
                setClient({ ...client, status });
                (await getDb()).from("clients").update({ status }).eq("id", client.id).then(() => {});
              }} style={{ accentColor: "var(--accent)" }} />
              <span style={{ color: "var(--text-2)", fontSize: 13 }}>Active</span>
            </label>
            <button className="btn-ghost" onClick={() => setEditing(e => !e)}>{editing ? "Close" : "Edit client"}</button>
          </div>
        </div>
      </div>

      {editing && <EditClient client={client} onSaved={() => { setEditing(false); load(); }} />}

      <div className="kpis">
        <Kpi label="Profit" value={money(stats.profit)} color={tone(stats.profit)} />
        <Kpi label="Client share" value={money(stats.clientShare)} />
        <Kpi label="Your share" value={money(stats.yours)} />
        <Kpi label="Received" value={money(stats.received)} />
        <Kpi label="Open plays" value={String(stats.open)} />
        <Kpi label="Loan" value={money(stats.loan)} />
        <Kpi label="Outstanding" value={money(stats.outstanding)} />
      </div>

      <div className="tab-bar" style={{ alignSelf: "flex-start" }}>
        <button className={`tab${tab === "plays" ? " active" : ""}`} onClick={() => setTab("plays")}>Plays · {plays.length}</button>
        <button className={`tab${tab === "ledger" ? " active" : ""}`} onClick={() => setTab("ledger")}>Loan and payments</button>
      </div>

      {tab === "plays"
        ? <Plays client={client} plays={plays} legsBy={legsBy} reload={load} />
        : <Ledger client={client} moves={moves} setts={setts} loan={stats.loan} reload={load} />}
    </div>
  );
}

function Kpi({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="kpi">
      <div className="stat-label">{label}</div>
      <div className="kpi-value" style={{ color: color || "var(--text)" }}>{value}</div>
    </div>
  );
}

// ─── Edit client ───────────────────────────────────────────────
function EditClient({ client, onSaved }: { client: Client; onSaved: () => void }) {
  const [f, setF] = useState({
    name: client.name, phone: client.phone || "", email: client.email || "", state: client.state || "",
    split: client.split != null ? String(Math.round(client.split * 1000) / 10) : "35",
    status: client.status || "active", referred_by: client.referred_by || "", notes: client.notes || "",
    approved_books: client.approved_books || [],
  });
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: any) => setF(p => ({ ...p, [k]: e.target.value }));
  const toggleBook = (b: string) => setF(p => ({ ...p, approved_books: p.approved_books.includes(b) ? p.approved_books.filter(x => x !== b) : [...p.approved_books, b] }));

  const save = async () => {
    try {
      const db = await getDb();
      const { error } = await db.from("clients").update({
        name: f.name.trim(), phone: f.phone.trim() || null, email: f.email.trim() || null,
        state: f.state.trim().toUpperCase() || null, split: (parseFloat(f.split) || 0) / 100,
        status: f.status, referred_by: f.referred_by.trim() || null, notes: f.notes.trim() || null,
        approved_books: f.approved_books,
      }).eq("id", client.id);
      if (error) throw error;
      onSaved();
    } catch (e: any) { setErr(e?.message || "Could not save."); }
  };

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="form-grid">
        <div><span className="label">Name</span><input className="input" value={f.name} onChange={set("name")} /></div>
        <div><span className="label">Phone</span><input className="input" value={f.phone} onChange={set("phone")} inputMode="tel" /></div>
        <div><span className="label">Email</span><input className="input" value={f.email} onChange={set("email")} /></div>
        <div><span className="label">State</span><input className="input" value={f.state} onChange={set("state")} maxLength={2} /></div>
        <div><span className="label">Client split %</span><input className="input num" value={f.split} onChange={set("split")} /></div>
        <div>
          <span className="label">Status</span>
          <select className="input" value={f.status} onChange={set("status")}>
            <option value="active">Active</option><option value="inactive">Inactive</option>
          </select>
        </div>
        <div><span className="label">Referred by</span><input className="input" value={f.referred_by} onChange={set("referred_by")} /></div>
      </div>
      <div>
        <span className="label">Approved books</span>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {ALL_BOOKS.map(b => (
            <button key={b} className={`pill${f.approved_books.includes(b) ? " on" : ""}`} style={{ cursor: "pointer", padding: "4px 9px" }} onClick={() => toggleBook(b)}>{b}</button>
          ))}
        </div>
      </div>
      <div><span className="label">Notes</span><textarea className="input" rows={2} value={f.notes} onChange={set("notes")} /></div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button className="btn-primary" style={{ width: "auto" }} onClick={save}>Save</button>
        {err && <span style={{ color: "var(--neg)", fontSize: 12 }}>{err}</span>}
      </div>
    </div>
  );
}


/**
 * Self hedge loan math: the stake went on the loan when the bet was placed.
 * If your self hedge wins, the whole payout comes off the loan; if it loses, the loan stays.
 * A void refunds the stake. Only applies to plays whose self hedge was logged here
 * (imported plays already have their loan baked into the opening balance).
 */
async function syncSelfHedgeReturns(db: any, play: Play, legs: Leg[], results: Record<string, Leg["result"]> | null) {
  const { data: stakes } = await db.from("capital_movements").select("id").eq("play_id", play.id).eq("type", "self_hedge_stake");
  if (!stakes || stakes.length === 0) return;
  await db.from("capital_movements").delete().eq("play_id", play.id).eq("type", "self_hedge_return");
  if (!results) return;
  const rows = legs.filter(l => l.self_hedge).flatMap(l => {
    const r = results[l.id];
    const amount = r === "won" ? Number(l.payout) : r === "void" ? Number(l.cash_stake) : 0;
    return amount > 0 ? [{
      client_id: play.client_id, play_id: play.id, type: "self_hedge_return", amount: Math.round(amount * 100) / 100,
      date: today(), notes: `${l.book || "Self hedge"} ${r === "won" ? "won" : "voided"}${l.selection ? `: ${l.selection}` : ""}`,
    }] : [];
  });
  if (rows.length) {
    const { error } = await db.from("capital_movements").insert(rows);
    if (error) throw error;
  }
}

// ─── Plays ─────────────────────────────────────────────────────
function Plays({ client, plays, legsBy, reload }: { client: Client; plays: Play[]; legsBy: Map<string, Leg[]>; reload: () => void }) {
  const [filter, setFilter] = useState<"open" | "settled" | "all">(plays.some(p => p.status === "open") ? "open" : "all");
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const shown = plays.filter(p => filter === "all" || p.status === filter);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <div className="tab-bar">
          {(["open", "settled", "all"] as const).map(k => (
            <button key={k} className={`tab${filter === k ? " active" : ""}`} onClick={() => setFilter(k)}>
              {k === "open" ? `Open · ${plays.filter(p => p.status === "open").length}` : k === "settled" ? "Settled" : "All"}
            </button>
          ))}
        </div>
        <button className="btn-primary" style={{ width: "auto" }} onClick={() => setAdding(a => !a)}>{adding ? "Close" : "Add play"}</button>
      </div>

      {adding && <AddPlay clientId={client.id} onDone={() => { setAdding(false); reload(); }} />}

      {shown.length === 0 && <div className="card" style={{ textAlign: "center", padding: 32, color: "var(--muted)", borderStyle: "dashed" }}>No {filter === "all" ? "" : filter} plays</div>}

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Date</th><th>Promo</th><th>Type</th><th>Book</th><th>Status</th>
              <th className="r">Profit</th><th className="r">Client</th><th className="r">You</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(p => {
              const L = legsBy.get(p.id) || [];
              const profit = p.status === "settled" ? Number(p.profit) || 0 : null;
              const cs = Number(p.client_share) || 0;
              return (
                <PlayRow key={p.id} play={p} legs={L} client={client} expanded={openId === p.id}
                  onToggle={() => setOpenId(openId === p.id ? null : p.id)} reload={reload}
                  profit={profit} clientShare={cs} />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PlayRow({ play, legs, client, expanded, onToggle, reload, profit, clientShare }:
  { play: Play; legs: Leg[]; client: Client; expanded: boolean; onToggle: () => void; reload: () => void; profit: number | null; clientShare: number }) {
  return (
    <>
      <tr className="clickable" onClick={onToggle}>
        <td style={{ color: "var(--text-2)" }}>{play.placed_on || "—"}</td>
        <td style={{ fontWeight: 500 }}>{play.promo || "—"}</td>
        <td style={{ color: "var(--text-2)" }}>{play.promo_type || "—"}</td>
        <td style={{ color: "var(--text-2)" }}>{play.book || "—"}</td>
        <td><span className={`status ${play.status}`}>{play.status}</span></td>
        <td className="r" style={{ color: profit == null ? "var(--muted)" : tone(profit) }}>{profit == null ? "—" : money(profit)}</td>
        <td className="r" style={{ color: "var(--text-2)" }}>{profit == null ? "—" : money(clientShare)}</td>
        <td className="r">{profit == null ? "—" : money(profit - clientShare)}</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={8} style={{ background: "var(--surface-2)", whiteSpace: "normal", padding: 14 }}>
            <PlayDetail play={play} legs={legs} client={client} reload={reload} />
          </td>
        </tr>
      )}
    </>
  );
}

function PlayDetail({ play, legs, client, reload }: { play: Play; legs: Leg[]; client: Client; reload: () => void }) {
  const seqs = Array.from(new Set(legs.map(l => l.seq))).sort((a, b) => a - b);
  const [winners, setWinners] = useState<Record<number, "promo" | "hedge" | "void">>(() => {
    const w: Record<number, "promo" | "hedge" | "void"> = {};
    seqs.forEach(s => {
      const won = legs.find(l => l.seq === s && l.result === "won");
      w[s] = won ? won.side : legs.some(l => l.seq === s && l.result === "void") ? "void" : "promo";
    });
    return w;
  });
  const [profitManual, setProfitManual] = useState(play.profit_override != null ? String(play.profit_override) : "");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const settle = async () => {
    setBusy(true); setErr(null);
    try {
      const db = await getDb();
      const results: Record<string, Leg["result"]> = {};
      for (const l of legs) {
        const w = winners[l.seq];
        const result = w === "void" ? "void" : l.side === w ? "won" : "lost";
        results[l.id] = result;
        if (result !== l.result) {
          const { error } = await db.from("legs").update({ result }).eq("id", l.id);
          if (error) throw error;
        }
      }
      const patch: any = { status: "settled", settled_on: play.settled_on || today() };
      if (legs.length === 0) patch.profit_override = parseFloat(profitManual) || 0;
      const { error } = await db.from("plays").update(patch).eq("id", play.id);
      if (error) throw error;
      await syncSelfHedgeReturns(db, play, legs, results);
      reload();
    } catch (e: any) { setErr(e?.message || "Could not settle."); }
    setBusy(false);
  };

  const setStatus = async (status: "open" | "void") => {
    setBusy(true);
    const db = await getDb();
    if (status === "open") await db.from("legs").update({ result: "pending" }).eq("play_id", play.id);
    await db.from("plays").update({ status, settled_on: null }).eq("id", play.id);
    // Reopen: undo any self-hedge payout; void: refund the self-hedge stake.
    const voided: Record<string, Leg["result"]> = {};
    legs.forEach(l => { voided[l.id] = "void"; });
    await syncSelfHedgeReturns(db, play, legs, status === "void" ? voided : null);
    setBusy(false); reload();
  };

  const remove = async () => {
    const db = await getDb();
    await db.from("capital_movements").delete().eq("play_id", play.id);   // drop its loan entries too
    await db.from("plays").delete().eq("id", play.id);
    reload();
  };

  // Withdrawal text: winning legs that sit in the client's own accounts.
  const winning = legs.filter(l => l.result === "won" && !l.self_hedge && Number(l.payout) > 0);
  const withdrawMsg = winning.length
    ? [`Hey ${client.name.split(" ")[0]}, ${play.promo ? `the ${play.promo} play` : "your play"} settled.`, "",
       ...winning.map(l => `Please withdraw ${money(l.payout)} from ${l.book}${l.selection ? ` (${l.selection} won)` : ""}.`),
       "", "Send it over once it lands. Thanks!"].join("\n")
    : "";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {legs.length > 0 ? (
        <table className="data" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6 }}>
          <thead>
            <tr><th>Pair</th><th>Side</th><th>Book</th><th>Selection</th><th className="r">Cash</th><th className="r">Credit</th><th className="r">Payout</th><th>Result</th></tr>
          </thead>
          <tbody>
            {legs.map(l => (
              <tr key={l.id}>
                <td style={{ color: "var(--muted)" }}>{l.seq}</td>
                <td>{l.side === "promo" ? "Promo" : "Hedge"}</td>
                <td>{l.book || "—"}{l.self_hedge && <span className="pill" style={{ marginLeft: 6 }}>self</span>}</td>
                <td style={{ color: "var(--text-2)", whiteSpace: "normal" }}>{l.selection || "—"}{l.odds ? ` ${l.odds}` : ""}</td>
                <td className="r">{money(l.cash_stake)}</td>
                <td className="r" style={{ color: "var(--text-2)" }}>{Number(l.credit_stake) ? money(l.credit_stake) : "—"}</td>
                <td className="r">{money(l.payout)}</td>
                <td><span className={`status ${l.result}`}>{l.result}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="hint" style={{ marginTop: 0 }}>No bets recorded on this play.</div>
      )}

      {play.notes && <div style={{ fontSize: 12, color: "var(--text-2)" }}>Notes: {play.notes}</div>}
      {play.legacy_row && <div style={{ fontSize: 11, color: "var(--muted)" }}>Imported from sheet row {play.legacy_row}{play.profit_override != null ? " · profit entered by hand" : ""}</div>}

      {play.status !== "void" && (
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
          {seqs.map(s => (
            <div key={s}>
              <span className="label">Pair {s} winner</span>
              <select className="input" value={winners[s]} onChange={e => setWinners(w => ({ ...w, [s]: e.target.value as any }))} style={{ width: 170 }}>
                <option value="promo">Promo leg won</option>
                <option value="hedge">Hedge leg won</option>
                <option value="void">Void / push</option>
              </select>
            </div>
          ))}
          {legs.length === 0 && (
            <div>
              <span className="label">Profit</span>
              <input className="input num" value={profitManual} onChange={e => setProfitManual(e.target.value)} style={{ width: 140 }} />
            </div>
          )}
          <button className="btn-primary" style={{ width: "auto" }} onClick={settle} disabled={busy}>
            {play.status === "settled" ? "Update result" : "Settle play"}
          </button>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {play.status === "settled" && withdrawMsg && (
          <a className="btn-ghost" href={smsHref(client.phone, withdrawMsg)}>Text withdrawal</a>
        )}
        {play.status !== "open" && <button className="btn-ghost" onClick={() => setStatus("open")} disabled={busy}>Reopen</button>}
        {play.status !== "void" && <button className="btn-ghost" onClick={() => setStatus("void")} disabled={busy}>Void</button>}
        {confirmDelete
          ? <button className="btn-ghost btn-danger" onClick={remove}>Confirm delete</button>
          : <button className="btn-ghost" onClick={() => setConfirmDelete(true)}>Delete</button>}
        {err && <span style={{ color: "var(--neg)", fontSize: 12 }}>{err}</span>}
      </div>
      {play.status === "settled" && winning.length === 0 && legs.length > 0 && (
        <div className="hint" style={{ marginTop: 0 }}>No winning bets in the client's accounts, so there's nothing to withdraw.</div>
      )}
    </div>
  );
}

// ─── Add play ──────────────────────────────────────────────────
interface LegDraft { book: string; selection: string; odds: string; cash: string; credit: string; payout: string; self: boolean }
const blankLeg = (book = ""): LegDraft => ({ book, selection: "", odds: "", cash: "", credit: "", payout: "", self: false });

function AddPlay({ clientId, onDone }: { clientId: string; onDone: () => void }) {
  const [f, setF] = useState({ promo: "", type: "Free Bet", book: "FanDuel", date: today(), notes: "" });
  const [pairs, setPairs] = useState<{ promo: LegDraft; hedge: LegDraft }[]>([{ promo: blankLeg("FanDuel"), hedge: blankLeg("DraftKings") }]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const n = (s: string) => parseFloat(s) || 0;

  const setLeg = (i: number, side: "promo" | "hedge", k: keyof LegDraft, v: any) =>
    setPairs(ps => ps.map((p, j) => j === i ? { ...p, [side]: { ...p[side], [k]: v } } : p));

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const db = await getDb();
      const { data, error } = await db.from("plays").insert({
        client_id: clientId, promo: f.promo.trim() || null, promo_type: f.type, book: f.book,
        status: "open", placed_on: f.date, notes: f.notes.trim() || null,
      }).select("id").single();
      if (error) throw error;
      const rows = pairs.flatMap((p, i) => (["promo", "hedge"] as const).map(side => {
        const d = p[side];
        return {
          play_id: data!.id, seq: i + 1, side, book: d.book || null, self_hedge: side === "hedge" ? d.self : false,
          selection: d.selection.trim() || null, odds: d.odds.trim() || null,
          cash_stake: n(d.cash), credit_stake: n(d.credit), payout: n(d.payout), result: "pending",
        };
      })).filter(r => r.book || r.cash_stake || r.payout);
      if (rows.length) {
        const { error: e2 } = await db.from("legs").insert(rows);
        if (e2) throw e2;
      }
      const selfStake = rows.filter(r => r.self_hedge).reduce((t, r) => t + r.cash_stake, 0);
      if (selfStake > 0) {
        const { error: e3 } = await db.from("capital_movements").insert({
          client_id: clientId, play_id: data!.id, type: "self_hedge_stake", amount: selfStake, date: f.date,
          notes: f.promo.trim() ? `Self hedge: ${f.promo.trim()}` : "Self hedge",
        });
        if (e3) throw e3;
      }
      onDone();
    } catch (e: any) { setErr(e?.message || "Could not save."); setBusy(false); }
  };

  const LegFields = ({ i, side }: { i: number; side: "promo" | "hedge" }) => {
    const d = pairs[i][side];
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 8, alignItems: "end" }}>
        <div>
          <span className="label">{side === "promo" ? "Promo book" : "Hedge book"}</span>
          <select className="input" value={d.book} onChange={e => setLeg(i, side, "book", e.target.value)}>
            <option value="">—</option>{ALL_BOOKS.map(b => <option key={b}>{b}</option>)}
          </select>
        </div>
        <div><span className="label">Selection</span><input className="input" value={d.selection} onChange={e => setLeg(i, side, "selection", e.target.value)} /></div>
        <div><span className="label">Odds</span><input className="input num" value={d.odds} onChange={e => setLeg(i, side, "odds", e.target.value)} placeholder="+250" /></div>
        <div><span className="label">Cash</span><input className="input num" value={d.cash} onChange={e => setLeg(i, side, "cash", e.target.value)} /></div>
        <div><span className="label">Credit</span><input className="input num" value={d.credit} onChange={e => setLeg(i, side, "credit", e.target.value)} /></div>
        <div><span className="label">Payout if wins</span><input className="input num" value={d.payout} onChange={e => setLeg(i, side, "payout", e.target.value)} /></div>
        {side === "hedge" && (
          <label className="tog" style={{ paddingBottom: 8 }}>
            <input type="checkbox" checked={d.self} onChange={e => setLeg(i, side, "self", e.target.checked)} style={{ accentColor: "var(--accent)" }} />
            <span style={{ color: "var(--text-2)", fontSize: 13 }}>Self hedge</span>
          </label>
        )}
      </div>
    );
  };

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="form-grid">
        <div><span className="label">Promo</span><input className="input" value={f.promo} onChange={e => setF(p => ({ ...p, promo: e.target.value }))} placeholder="fd 500 rfb" /></div>
        <div>
          <span className="label">Type</span>
          <select className="input" value={f.type} onChange={e => setF(p => ({ ...p, type: e.target.value }))}>{PLAY_TYPES.map(t => <option key={t}>{t}</option>)}</select>
        </div>
        <div>
          <span className="label">Promo book</span>
          <select className="input" value={f.book} onChange={e => setF(p => ({ ...p, book: e.target.value }))}>{ALL_BOOKS.map(b => <option key={b}>{b}</option>)}</select>
        </div>
        <div><span className="label">Date</span><input className="input" type="date" value={f.date} onChange={e => setF(p => ({ ...p, date: e.target.value }))} /></div>
      </div>
      {pairs.map((_, i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
          <div className="section-title" style={{ fontSize: 12 }}>Pair {i + 1}</div>
          {LegFields({ i, side: "promo" })}
          {LegFields({ i, side: "hedge" })}
        </div>
      ))}
      <div><span className="label">Notes</span><input className="input" value={f.notes} onChange={e => setF(p => ({ ...p, notes: e.target.value }))} /></div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn-primary" style={{ width: "auto" }} onClick={save} disabled={busy}>{busy ? "Saving…" : "Save play"}</button>
        <button className="btn-ghost" onClick={() => setPairs(ps => [...ps, { promo: blankLeg(f.book), hedge: blankLeg() }])}>Add second pair</button>
        {err && <span style={{ color: "var(--neg)", fontSize: 12 }}>{err}</span>}
      </div>
    </div>
  );
}

// ─── Loan ledger + payments ────────────────────────────────────
function Ledger({ client, moves, setts, loan, reload }: { client: Client; moves: Movement[]; setts: Settlement[]; loan: number; reload: () => void }) {
  const [mv, setMv] = useState({ type: "sent_to_client" as MoveType, amount: "", date: today(), notes: "" });
  const [st, setSt] = useState({ amount: "", date: today(), method: "Zelle", notes: "" });
  const [err, setErr] = useState<string | null>(null);

  const addMove = async () => {
    const amount = parseFloat(mv.amount);
    if (!amount) return;
    const db = await getDb();
    const { error } = await db.from("capital_movements").insert({ client_id: client.id, type: mv.type, amount: Math.abs(amount), date: mv.date, notes: mv.notes.trim() || null });
    if (error) { setErr(error.message); return; }
    setMv(m => ({ ...m, amount: "", notes: "" })); reload();
  };
  const addSett = async () => {
    const amount = parseFloat(st.amount);
    if (!amount) return;
    const db = await getDb();
    const { error } = await db.from("settlements").insert({ client_id: client.id, amount, date: st.date, method: st.method || null, notes: st.notes.trim() || null });
    if (error) { setErr(error.message); return; }
    setSt(s => ({ ...s, amount: "", notes: "" })); reload();
  };
  const del = async (table: "capital_movements" | "settlements", id: string) => {
    const db = await getDb();
    await db.from(table).delete().eq("id", id);
    reload();
  };

  return (
    <div className="grid-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div className="section-title">Loan</div>
          <div className="num" style={{ fontWeight: 600 }}>{money(loan)} out</div>
        </div>
        <div className="form-grid">
          <div>
            <span className="label">Type</span>
            <select className="input" value={mv.type} onChange={e => setMv(m => ({ ...m, type: e.target.value as MoveType }))}>
              {(Object.keys(MOVE_LABEL) as MoveType[]).map(t => <option key={t} value={t}>{MOVE_LABEL[t]} ({MOVE_SIGN[t] > 0 ? "+" : "−"})</option>)}
            </select>
          </div>
          <div><span className="label">Amount</span><input className="input num" value={mv.amount} onChange={e => setMv(m => ({ ...m, amount: e.target.value }))} /></div>
          <div><span className="label">Date</span><input className="input" type="date" value={mv.date} onChange={e => setMv(m => ({ ...m, date: e.target.value }))} /></div>
        </div>
        <input className="input" placeholder="Notes" value={mv.notes} onChange={e => setMv(m => ({ ...m, notes: e.target.value }))} />
        <button className="btn-ghost" style={{ alignSelf: "flex-start" }} onClick={addMove}>Add entry</button>
        <LedgerList rows={moves.map(m => ({ id: m.id, date: m.date, label: MOVE_LABEL[m.type], amount: MOVE_SIGN[m.type] * Number(m.amount), notes: m.notes }))} onDelete={id => del("capital_movements", id)} />
      </div>

      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div className="section-title">Payments received</div>
          <div className="num" style={{ fontWeight: 600 }}>{money(setts.reduce((s, x) => s + Number(x.amount), 0))}</div>
        </div>
        <div className="form-grid">
          <div><span className="label">Amount</span><input className="input num" value={st.amount} onChange={e => setSt(s => ({ ...s, amount: e.target.value }))} /></div>
          <div><span className="label">Date</span><input className="input" type="date" value={st.date} onChange={e => setSt(s => ({ ...s, date: e.target.value }))} /></div>
          <div>
            <span className="label">Method</span>
            <select className="input" value={st.method} onChange={e => setSt(s => ({ ...s, method: e.target.value }))}>
              {["Zelle", "Venmo", "Cash App", "PayPal", "Cash", "Bank transfer", "Other"].map(m => <option key={m}>{m}</option>)}
            </select>
          </div>
        </div>
        <input className="input" placeholder="Notes" value={st.notes} onChange={e => setSt(s => ({ ...s, notes: e.target.value }))} />
        <button className="btn-ghost" style={{ alignSelf: "flex-start" }} onClick={addSett}>Add payment</button>
        <LedgerList rows={setts.map(s => ({ id: s.id, date: s.date, label: s.method || "Payment", amount: Number(s.amount), notes: s.notes }))} onDelete={id => del("settlements", id)} />
      </div>
      {err && <div style={{ color: "var(--neg)", fontSize: 12 }}>{err}</div>}
    </div>
  );
}

function LedgerList({ rows, onDelete }: { rows: { id: string; date: string | null; label: string; amount: number; notes: string | null }[]; onDelete: (id: string) => void }) {
  const [armed, setArmed] = useState<string | null>(null);
  if (!rows.length) return <div className="hint" style={{ marginTop: 0 }}>Nothing recorded yet.</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {rows.map(r => (
        <div key={r.id} className="divider" style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "8px 0" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13 }}>{r.label}</div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>{[r.date, r.notes].filter(Boolean).join(" · ")}</div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexShrink: 0 }}>
            <span className="num" style={{ color: "var(--text)" }}>{r.amount > 0 ? "+" : ""}{money(r.amount)}</span>
            {armed === r.id
              ? <button className="link" style={{ color: "var(--neg)", fontSize: 12 }} onClick={() => onDelete(r.id)}>Confirm</button>
              : <button className="link" style={{ color: "var(--muted)", fontSize: 12 }} onClick={() => setArmed(r.id)}>Delete</button>}
          </div>
        </div>
      ))}
    </div>
  );
}
