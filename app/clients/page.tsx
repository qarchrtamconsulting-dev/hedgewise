"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Client, ClientSummary, daysSince, fetchAll, getDb, money, money0, pct, shortDate, tone } from "@/lib/db";
import { Stage, nextOffer } from "@/lib/playbook";

type Row = Client & ClientSummary & { balance: number; outstanding: number; next_app: string | null };
type SortKey = "next_app" | "status" | "outstanding" | "name" | "state" | "split" | "open_plays" | "settled_plays" | "profit" | "your_share" | "received" | "balance" | "loan_outstanding" | "last_play" | "started_on";
type Filter = "active" | "onboarding" | "open" | "loan" | "all";

const COLS: { key: SortKey; label: string; right?: boolean }[] = [
  { key: "status", label: "Active" },
  { key: "name", label: "Client" },
  { key: "state", label: "State" },
  { key: "started_on", label: "Started" },
  { key: "split", label: "Split", right: true },
  { key: "open_plays", label: "Open", right: true },
  { key: "settled_plays", label: "Settled", right: true },
  { key: "profit", label: "Profit", right: true },
  { key: "your_share", label: "Your share", right: true },
  { key: "received", label: "Received", right: true },
  { key: "loan_outstanding", label: "Loan", right: true },
  { key: "outstanding", label: "Outstanding", right: true },
  { key: "next_app", label: "Next app" },
  { key: "last_play", label: "Last play", right: true },
];

export default function ClientsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("active");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "outstanding", dir: -1 });
  const [adding, setAdding] = useState(false);

  const load = async () => {
    try {
      const db = await getDb();
      const [clients, sums] = await Promise.all([
        fetchAll<Client>((a, b) => db.from("clients").select("id,name,phone,email,state,split,status,referred_by,notes,approved_books").order("name").range(a, b)),
        fetchAll<ClientSummary>((a, b) => db.from("client_summary").select("*").range(a, b)),
      ]);
      const byId = new Map(sums.map(s => [s.client_id, s]));
      // Onboarding progress (table may not exist yet)
      const booksBy = new Map<string, Record<string, Stage>>();
      try {
        const cb = await fetchAll<any>((a, b) => db.from("client_books").select("client_id,offer,stage").range(a, b));
        cb.forEach(r => { const m = booksBy.get(r.client_id) || {}; m[r.offer] = r.stage; booksBy.set(r.client_id, m); });
      } catch {}
      setRows(clients.map(c => {
        const s = byId.get(c.id) || ({ open_plays: 0, settled_plays: 0, profit: 0, client_share: 0, your_share: 0, received: 0, loan_outstanding: 0, last_play: null, started_on: null } as any);
        const n = (x: any) => Number(x) || 0;
        return { ...c, ...s, profit: n(s.profit), client_share: n(s.client_share), your_share: n(s.your_share), received: n(s.received), loan_outstanding: n(s.loan_outstanding), open_plays: n(s.open_plays), settled_plays: n(s.settled_plays), balance: n(s.your_share) - n(s.received),
          // What the client has out with you: loan fronted + your share they haven't sent yet (sheet: Total Loan + column AN)
          outstanding: n(s.loan_outstanding) + n(s.your_share) - n(s.received),
          // Only meaningful once the checklist is in use (or they're onboarding); otherwise unknown
          next_app: (booksBy.has(c.id) || c.status === "onboarding") ? (nextOffer(c.state, booksBy.get(c.id) || {})?.book || "All done") : null };
      }));
    } catch (e: any) {
      const m = e?.message || String(e);
      setErr(/client_summary|does not exist|schema cache/i.test(m)
        ? "The tracker tables aren't set up yet. Run supabase/tracker.sql in the Supabase SQL Editor, then refresh."
        : m);
    }
  };
  useEffect(() => { load(); }, []);

  const view = useMemo(() => {
    if (!rows) return [];
    const needle = q.trim().toLowerCase();
    let r = rows.filter(c => !needle || c.name.toLowerCase().includes(needle) || (c.state || "").toLowerCase() === needle);
    if (filter === "active") r = r.filter(c => c.status === "active");
    if (filter === "onboarding") r = r.filter(c => c.status === "onboarding");
    if (filter === "open") r = r.filter(c => c.open_plays > 0);
    if (filter === "loan") r = r.filter(c => c.outstanding > 0.5);
    const { key, dir } = sort;
    return [...r].sort((a, b) => {
      const x = (a as any)[key], y = (b as any)[key];
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return (typeof x === "string" ? x.localeCompare(y) : x - y) * dir;
    });
  }, [rows, q, filter, sort]);

  const toggleActive = async (c: Row) => {
    const status = c.status === "active" ? "inactive" : "active";
    setRows(rs => rs && rs.map(x => x.id === c.id ? { ...x, status } : x));
    try {
      const db = await getDb();
      const { error } = await db.from("clients").update({ status }).eq("id", c.id);
      if (error) throw error;
    } catch (e: any) {
      setRows(rs => rs && rs.map(x => x.id === c.id ? { ...x, status: c.status } : x));
      setErr(e?.message || "Could not update client.");
    }
  };

  const totals = useMemo(() => view.reduce((t, c) => ({
    profit: t.profit + c.profit, yours: t.yours + c.your_share, received: t.received + c.received,
    loan: t.loan + c.loan_outstanding, open: t.open + c.open_plays,
    outstanding: t.outstanding + Math.max(0, c.outstanding),
  }), { profit: 0, yours: 0, received: 0, loan: 0, open: 0, outstanding: 0 }), [view]);

  if (err) return <div className="banner" style={{ color: "var(--neg)" }}>{err}</div>;
  if (!rows) return <div style={{ color: "var(--muted)", padding: 24 }}>Loading clients…</div>;

  const hasImported = rows.some(r => r.settled_plays > 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 className="page-title">Clients</h1>
          <p className="page-sub">{view.length} of {rows.length} clients</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input className="input" placeholder="Search name or state" value={q} onChange={e => setQ(e.target.value)} style={{ width: 220 }} />
          <div className="tab-bar">
            {([["active", "Active"], ["onboarding", "Onboarding"], ["open", "Open plays"], ["loan", "Owes you"], ["all", "All"]] as const).map(([k, l]) => (
              <button key={k} className={`tab${filter === k ? " active" : ""}`} onClick={() => setFilter(k)}>{l}</button>
            ))}
          </div>
          <button className="btn-primary" style={{ width: "auto" }} onClick={() => setAdding(a => !a)}>Add client</button>
        </div>
      </div>

      {adding && <AddClient onDone={(id) => { setAdding(false); if (id) router.push(`/clients/${id}`); else load(); }} />}

      <div className="kpis">
        <Kpi label="Profit" value={money0(totals.profit)} />
        <Kpi label="Your share" value={money0(totals.yours)} />
        <Kpi label="Received" value={money0(totals.received)} />
        <Kpi label="Total outstanding" value={money(totals.outstanding)} />
        <Kpi label="Open plays" value={String(totals.open)} />
      </div>

      {hasImported && (
        <div className="banner">
          "Received" on imported history is the sheet's "Amount client sent" column, which covers loan repayments and referral money, not just profit splits.
        </div>
      )}

      {rows.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 48, borderStyle: "dashed" }}>
          <div style={{ color: "var(--text-2)" }}>No clients yet</div>
          <div className="hint">Add one above, or bring in your spreadsheet from the Import page.</div>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                {COLS.map(c => (
                  <th key={c.key} className={`sortable${c.right ? " r" : ""}`}
                    onClick={() => setSort(s => ({ key: c.key, dir: s.key === c.key ? (s.dir === 1 ? -1 : 1) : (c.key === "name" || c.key === "state" || c.key === "status" ? 1 : -1) }))}>
                    {c.label}{sort.key === c.key ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {view.map(c => (
                <tr key={c.id} className="clickable" onClick={() => router.push(`/clients/${c.id}`)}>
                  <td onClick={e => { e.stopPropagation(); toggleActive(c); }} style={{ width: 56 }}>
                    <input type="checkbox" checked={c.status === "active"} readOnly style={{ accentColor: "var(--accent)", cursor: "pointer", width: 15, height: 15 }} aria-label={`${c.name} active`} />
                  </td>
                  <td style={{ fontWeight: 500 }}>{c.name}</td>
                  <td style={{ color: "var(--text-2)" }}>{c.state || "—"}</td>
                  <td style={{ color: c.started_on ? "var(--text-2)" : "var(--muted)", whiteSpace: "nowrap" }}>
                    {c.started_on ? <>{shortDate(c.started_on)} <span style={{ color: "var(--muted)" }}>· day {daysSince(c.started_on)}</span></> : "—"}
                  </td>
                  <td className="r">{c.split != null ? pct(c.split) : "—"}</td>
                  <td className="r" style={{ color: c.open_plays ? "var(--warn)" : "var(--muted)" }}>{c.open_plays}</td>
                  <td className="r" style={{ color: "var(--text-2)" }}>{c.settled_plays}</td>
                  <td className="r" style={{ color: tone(c.profit) }}>{money0(c.profit)}</td>
                  <td className="r">{money0(c.your_share)}</td>
                  <td className="r" style={{ color: "var(--text-2)" }}>{money0(c.received)}</td>
                  <td className="r" style={{ color: Math.abs(c.loan_outstanding) > 0.5 ? "var(--text-2)" : "var(--muted)" }}>{money(c.loan_outstanding)}</td>
                  <td className="r" style={{ fontWeight: 500, color: c.outstanding > 0.5 ? "var(--text)" : "var(--muted)" }}>{money(c.outstanding)}</td>
                  <td style={{ color: c.next_app ? "var(--text-2)" : "var(--muted)" }}>{c.next_app || "—"}</td>
                  <td className="r" style={{ color: "var(--text-2)" }}>{c.last_play || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="kpi">
      <div className="stat-label">{label}</div>
      <div className="kpi-value">{value}</div>
    </div>
  );
}

function AddClient({ onDone }: { onDone: (id?: string) => void }) {
  const [f, setF] = useState({ name: "", phone: "", email: "", state: "", split: "35", referred_by: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: any) => setF(p => ({ ...p, [k]: e.target.value }));

  const save = async () => {
    if (!f.name.trim()) { setErr("Name is required."); return; }
    setBusy(true); setErr(null);
    try {
      const db = await getDb();
      const { data, error } = await db.from("clients").insert({
        name: f.name.trim(), phone: f.phone.trim() || null, email: f.email.trim() || null,
        state: f.state.trim().toUpperCase() || null, split: (parseFloat(f.split) || 0) / 100,
        referred_by: f.referred_by.trim() || null, status: "onboarding", books: [],
      }).select("id").single();
      if (error) throw error;
      onDone(data?.id);
    } catch (e: any) {
      setErr(e?.message || "Could not save.");
      setBusy(false);
    }
  };

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="section-title">New client</div>
      <div className="form-grid">
        <div><span className="label">Name</span><input className="input" value={f.name} onChange={set("name")} autoFocus /></div>
        <div><span className="label">Phone</span><input className="input" value={f.phone} onChange={set("phone")} inputMode="tel" /></div>
        <div><span className="label">Email</span><input className="input" value={f.email} onChange={set("email")} /></div>
        <div><span className="label">State</span><input className="input" value={f.state} onChange={set("state")} maxLength={2} placeholder="VA" /></div>
        <div><span className="label">Client split %</span><input className="input num" value={f.split} onChange={set("split")} inputMode="decimal" /></div>
        <div><span className="label">Referred by</span><input className="input" value={f.referred_by} onChange={set("referred_by")} /></div>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button className="btn-primary" style={{ width: "auto" }} onClick={save} disabled={busy}>{busy ? "Saving…" : "Save client"}</button>
        <button className="btn-ghost" onClick={() => onDone()}>Cancel</button>
        {err && <span style={{ color: "var(--neg)", fontSize: 12 }}>{err}</span>}
      </div>
    </div>
  );
}
