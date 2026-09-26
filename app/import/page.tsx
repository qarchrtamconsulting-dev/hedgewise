"use client";
import { useState } from "react";
import Link from "next/link";
import { fetchAll, getDb, money0 } from "@/lib/db";

interface ImportFile {
  version: number;
  source?: string;
  clients: any[]; plays: any[]; legs: any[]; movements: any[]; settlements: any[];
  report?: any;
}

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

export default function ImportPage() {
  const [file, setFile] = useState<ImportFile | null>(null);
  const [fileName, setFileName] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [replace, setReplace] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const pick = async (f: File | undefined) => {
    setErr(null); setDone(false); setLog([]); setFile(null);
    if (!f) return;
    try {
      const j = JSON.parse(await f.text());
      if (!j || j.version !== 1 || !Array.isArray(j.clients) || !Array.isArray(j.plays)) throw new Error("This isn't a Hedgewise import file.");
      setFile(j); setFileName(f.name);
    } catch (e: any) { setErr(e?.message || "Could not read the file."); }
  };

  const say = (m: string) => setLog(l => [...l, m]);

  const run = async () => {
    if (!file) return;
    setBusy(true); setErr(null); setLog([]);
    try {
      const db = await getDb();

      if (replace) {
        // Deleting clients cascades to their plays, bets, loan entries and payments.
        say("Clearing existing clients and history…");
        const ZERO = "00000000-0000-0000-0000-000000000000";
        for (const t of ["settlements", "capital_movements", "legs", "plays", "clients"]) {
          const { error } = await db.from(t).delete().neq("id", ZERO);
          if (error) throw new Error(`Clearing ${t}: ${error.message}`);
        }
        say("Cleared.");
      }

      // Match clients that already exist by name so nobody gets duplicated.
      const existing = await fetchAll<any>((a, b) => db.from("clients").select("id,name").range(a, b));
      const byName = new Map(existing.map(c => [norm(c.name), c.id]));
      const remap = new Map<string, string>();
      const newClients: any[] = [];
      for (const c of file.clients) {
        const hit = byName.get(norm(c.name));
        if (hit) { if (hit !== c.id) remap.set(c.id, hit); continue; }   // keep whatever is already saved
        newClients.push({ ...c, books: [] });
      }
      const cid = (id: string) => remap.get(id) || id;
      say(`${file.clients.length} clients in file · ${remap.size} already in Hedgewise · ${newClients.length} to add`);

      const batches = async (table: string, rows: any[], label: string) => {
        say(`${label}: 0 / ${rows.length}`);
        for (let i = 0; i < rows.length; i += 500) {
          const chunk = rows.slice(i, i + 500);
          const { error } = await db.from(table).upsert(chunk, { onConflict: "id", ignoreDuplicates: true });
          if (error) throw new Error(`${label}: ${error.message}`);
          setLog(l => [...l.slice(0, -1), `${label}: ${Math.min(i + 500, rows.length)} / ${rows.length}`]);
        }
      };

      await batches("clients", newClients, "Clients");
      await batches("plays", file.plays.map(p => ({ ...p, client_id: cid(p.client_id) })), "Plays");
      await batches("legs", file.legs, "Bets");
      await batches("capital_movements", file.movements.map(m => ({ ...m, client_id: cid(m.client_id) })), "Loan entries");
      await batches("settlements", file.settlements.map(s => ({ ...s, client_id: cid(s.client_id) })), "Payments");
      say("Done.");
      setDone(true);
    } catch (e: any) {
      const m = e?.message || String(e);
      setErr(/does not exist|schema cache|relation/i.test(m) ? `${m}. Run supabase/tracker.sql in Supabase first.` : m);
    }
    setBusy(false);
  };

  const r = file?.report;

  return (
    <div style={{ maxWidth: 720, display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h1 className="page-title">Import</h1>
        <p className="page-sub">Load your spreadsheet history into the client tracker. The file is read in your browser and written straight to your database.</p>
      </div>

      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <span className="label" style={{ marginBottom: 0 }}>Import file (.json)</span>
        <input type="file" accept=".json,application/json" onChange={e => pick(e.target.files?.[0])} disabled={busy} />
        {file && (
          <div style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.7 }}>
            <div style={{ color: "var(--text)", fontWeight: 500 }}>{fileName}{file.source ? ` · from ${file.source}` : ""}</div>
            {file.clients.length} clients · {file.plays.length} plays · {file.legs.length} bets · {file.movements.length} loan entries · {file.settlements.length} payments
            {r?.app_totals && <div>Profit {money0(r.app_totals.profit)} · your share {money0(r.app_totals.yours)} · client share {money0(r.app_totals.client)}</div>}
          </div>
        )}
        <label className="tog" style={{ alignItems: "flex-start" }}>
          <input type="checkbox" checked={replace} onChange={e => { setReplace(e.target.checked); setConfirmText(""); }} style={{ accentColor: "var(--neg)", marginTop: 3 }} />
          <span style={{ color: "var(--text-2)", fontSize: 13, lineHeight: 1.5 }}>
            Replace everything: delete all current clients, plays, bets, loan entries and payments first, then load this file.
          </span>
        </label>
        {replace && (
          <div>
            <span className="label">Type REPLACE to confirm</span>
            <input className="input" value={confirmText} onChange={e => setConfirmText(e.target.value)} style={{ maxWidth: 220 }} />
          </div>
        )}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className="btn-primary" style={{ width: "auto" }} disabled={!file || busy || (replace && confirmText.trim().toUpperCase() !== "REPLACE")} onClick={run}>{busy ? "Importing…" : replace ? "Replace and import" : "Import"}</button>
          {done && <Link className="btn-ghost" href="/clients">Open clients</Link>}
        </div>
        <div className="hint" style={{ marginTop: 0 }}>Safe to run more than once. It only adds what is missing and never changes clients, plays or payments already in Hedgewise.</div>
      </div>

      {log.length > 0 && (
        <div className="card" style={{ fontSize: 13, lineHeight: 1.8 }}>
          {log.map((l, i) => <div key={i} style={{ color: i === log.length - 1 && !done ? "var(--text)" : "var(--text-2)" }}>{l}</div>)}
        </div>
      )}
      {err && <div className="banner" style={{ color: "var(--neg)" }}>{err}</div>}
    </div>
  );
}
