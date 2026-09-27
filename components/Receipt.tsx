"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Leg, Play, getDb, money, today } from "@/lib/db";
import { toDec } from "@/lib/constants";

/**
 * Receipt for a play that was sent to a client but not confirmed yet (status "sent").
 * Shows exactly what will be logged; odds, stakes and payouts can be corrected if the
 * line moved on the call. Confirm turns it into a tracked open bet; "Didn't place" deletes it.
 */

type Row = {
  id: string; side: "promo" | "hedge"; self: boolean; book: string; selection: string;
  credit: boolean; odds: string; stake: string; payout: string;
  /** payout ÷ plain payout at these odds, so boosted legs keep their boost when odds/stake change */
  mult: number;
};

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const plain = (stake: number, dec: number | null, credit: boolean) =>
  dec ? (credit ? stake * (dec - 1) : stake * dec) : 0;

function toRows(legs: Leg[]): Row[] {
  return [...legs]
    .sort((a, b) => a.seq - b.seq || (a.side === b.side ? Number(a.self_hedge) - Number(b.self_hedge) : a.side === "promo" ? -1 : 1))
    .map(l => {
      const credit = !(Number(l.cash_stake) > 0) && Number(l.credit_stake) > 0;
      const stake = credit ? Number(l.credit_stake) : Number(l.cash_stake);
      const base = plain(stake, toDec(l.odds || ""), credit);
      return {
        id: l.id, side: l.side, self: l.self_hedge, book: l.book || "", selection: l.selection || "", credit,
        odds: l.odds || "", stake: String(r2(stake)), payout: String(r2(Number(l.payout))),
        mult: base > 0 ? Number(l.payout) / base : 1,
      };
    });
}

export default function Receipt({ play, legs, clientName, sentAt, onDone }: {
  play: Play; legs: Leg[]; clientName?: string; sentAt?: string | null;
  onDone?: (result: "confirmed" | "discarded") => void;
}) {
  const [rows, setRows] = useState<Row[]>(() => toRows(legs));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<null | "confirmed" | "discarded">(null);
  const [sure, setSure] = useState(false);

  const set = (id: string, patch: Partial<Row>, recompute: boolean) => setRows(rs => rs.map(r => {
    if (r.id !== id) return r;
    const n = { ...r, ...patch };
    if (recompute) {
      const base = plain(parseFloat(n.stake) || 0, toDec(n.odds), n.credit);
      if (base > 0) n.payout = String(r2(base * n.mult));
    } else if (patch.payout !== undefined) {
      const base = plain(parseFloat(n.stake) || 0, toDec(n.odds), n.credit);
      if (base > 0) n.mult = (parseFloat(n.payout) || 0) / base;
    }
    return n;
  }));

  // Locked result: profit if the bet side wins vs if the hedge side wins (one pair only).
  const outcome = useMemo(() => {
    const cash = rows.reduce((s, r) => s + (r.credit ? 0 : parseFloat(r.stake) || 0), 0);
    const pay = (side: "promo" | "hedge") => rows.filter(r => r.side === side).reduce((s, r) => s + (parseFloat(r.payout) || 0), 0);
    const sides = new Set(rows.map(r => r.side));
    if (!sides.has("promo") || !sides.has("hedge")) return null;
    return { betWins: pay("promo") - cash, hedgeWins: pay("hedge") - cash };
  }, [rows]);
  const selfStake = rows.filter(r => r.self && !r.credit).reduce((s, r) => s + (parseFloat(r.stake) || 0), 0);

  const confirm = async () => {
    setBusy(true); setErr(null);
    try {
      const db = await getDb();
      for (const r of rows) {
        const stake = r2(parseFloat(r.stake) || 0);
        const { error } = await db.from("legs").update({
          odds: r.odds.trim() || null,
          cash_stake: r.credit ? 0 : stake, credit_stake: r.credit ? stake : 0,
          payout: r2(parseFloat(r.payout) || 0),
        }).eq("id", r.id);
        if (error) throw error;
      }
      const { error: pErr } = await db.from("plays").update({ status: "open", placed_on: today() }).eq("id", play.id);
      if (pErr) throw pErr;
      // Your self hedge goes on the client's loan once the bet is actually placed.
      if (selfStake > 0.005) {
        const self = rows.find(r => r.self);
        const { error: mErr } = await db.from("capital_movements").insert({
          client_id: play.client_id, play_id: play.id, type: "self_hedge_stake", amount: r2(selfStake), date: today(),
          notes: self ? `${self.book} ${self.selection} ${self.odds} (pays ${money(parseFloat(self.payout) || 0)})` : null,
        });
        if (mErr) throw mErr;
      }
      setDone("confirmed"); onDone?.("confirmed");
    } catch (e: any) {
      setErr(e?.message || "Couldn't log the bet.");
    }
    setBusy(false);
  };

  const discard = async () => {
    setBusy(true); setErr(null);
    try {
      const db = await getDb();
      const { error } = await db.from("plays").delete().eq("id", play.id).eq("status", "sent");
      if (error) throw error;
      setDone("discarded"); onDone?.("discarded");
    } catch (e: any) {
      setErr(e?.message || "Couldn't remove it.");
    }
    setBusy(false);
  };

  if (done === "confirmed") {
    return (
      <div className="receipt receipt-done">
        <span className="status settled">Logged</span>
        <span>{play.promo} for {clientName || "the client"} is now an open bet.</span>
        <Link className="link" href={`/clients/${play.client_id}`}>View client</Link>
      </div>
    );
  }
  if (done === "discarded") {
    return <div className="receipt receipt-done"><span className="status void">Removed</span><span>Nothing was logged.</span></div>;
  }

  const when = sentAt ? new Date(sentAt) : null;

  return (
    <div className="receipt">
      <div className="receipt-head">
        <div>
          <div className="receipt-title">{clientName ? `${clientName} · ` : ""}{play.promo}</div>
          <div className="task-sub">
            {play.notes ? `${play.notes} · ` : ""}Sent{when ? ` ${when.toLocaleDateString([], { month: "short", day: "numeric" })} ${when.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}
          </div>
        </div>
        <span className="status sent">Not logged yet</span>
      </div>

      <div className="receipt-legs">
        {rows.map(r => (
          <div key={r.id} className="receipt-leg">
            <div className="receipt-leg-name">
              <span className="task-sub">{r.side === "promo" ? "Bet" : r.self ? "Hedge (you)" : "Hedge"}{r.credit ? " · free bet" : ""}</span>
              <span style={{ fontWeight: 500 }}>{r.book}</span>
              <span style={{ color: "var(--text-2)" }}>{r.selection}</span>
            </div>
            <label className="receipt-field"><span className="label">Odds</span>
              <input className="input num" inputMode="text" value={r.odds} onChange={e => set(r.id, { odds: e.target.value }, true)} /></label>
            <label className="receipt-field"><span className="label">{r.credit ? "Free bet" : "Stake"}</span>
              <input className="input num" inputMode="decimal" value={r.stake} onChange={e => set(r.id, { stake: e.target.value }, true)} /></label>
            <label className="receipt-field"><span className="label">Pays</span>
              <input className="input num" inputMode="decimal" value={r.payout} onChange={e => set(r.id, { payout: e.target.value }, false)} /></label>
          </div>
        ))}
      </div>

      <div className="receipt-foot">
        <div className="task-sub" style={{ lineHeight: 1.6 }}>
          {outcome && <>If the bet wins <b className="num" style={{ color: outcome.betWins >= 0 ? "var(--pos)" : "var(--neg)" }}>{money(outcome.betWins)}</b> · if the hedge wins <b className="num" style={{ color: outcome.hedgeWins >= 0 ? "var(--pos)" : "var(--neg)" }}>{money(outcome.hedgeWins)}</b></>}
          {selfStake > 0.005 && <div>Your {money(selfStake)} hedge goes on the loan when you confirm.</div>}
        </div>
        <div className="task-actions">
          {sure ? (
            <>
              <span className="task-sub">Remove this without logging?</span>
              <button className="btn-ghost" onClick={discard} disabled={busy}>Yes, remove</button>
              <button className="btn-ghost" onClick={() => setSure(false)} disabled={busy}>Keep</button>
            </>
          ) : (
            <>
              <button className="btn-ghost" onClick={() => setSure(true)} disabled={busy}>Didn&apos;t place</button>
              <button className="btn-primary" style={{ width: "auto", padding: "8px 16px" }} onClick={confirm} disabled={busy}>{busy ? "Logging…" : "Confirm and log bet"}</button>
            </>
          )}
        </div>
      </div>
      {err && <div style={{ color: "var(--neg)", fontSize: 12 }}>{err}</div>}
    </div>
  );
}
