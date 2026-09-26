"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { FinderGame } from "./useGameFinder";
import { fmt } from "@/lib/constants";
import { copyText } from "@/lib/clipboard";
import { getDb, localIso } from "@/lib/db";

export interface Ticket {
  /** Promo type logged to the client's sheet, e.g. "Free Bet" */
  type: string;
  /** Promo amount (free bet size, risk-free stake, etc.) */
  amount: number;
  fixedStake: number;
  hedgeStake: number;
  /** Worst-case locked result, logged as expected profit */
  expected: number;
  /** Extra instruction on the fixed leg, e.g. "use your free bet" */
  fixedNote?: string;
  /** Total return if each leg wins (logged to the tracker) */
  fixedPayout: number;
  hedgePayout: number;
  /** Fixed leg is placed with bonus credit, not cash */
  fixedIsCredit?: boolean;
}

interface ClientRow { id: string; name: string; phone: string | null; approved_books: string[] | null; status: string | null }

const db = getDb;

// "sms:NUMBER?&body=TEXT" is the form both iPhone and Mac Messages accept.
const smsHref = (phone: string | null | undefined, body: string) => {
  let digits = (phone || "").replace(/[^\d+]/g, "");
  if (/^\d{10}$/.test(digits)) digits = `+1${digits}`;
  return `sms:${digits}?&body=${encodeURIComponent(body)}`;
};


/** clientHedge: the part of the hedge the client places (the rest goes in your account). */
export function buildMessage(game: FinderGame, fixedBook: string, t: Ticket, firstName?: string, clientHedge = t.hedgeStake) {
  const twoLegs = clientHedge > 0.005;
  const when = new Date(game.commence);
  const date = when.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  const time = when.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const lines = [
    firstName ? `Hey ${firstName}, here's your next play.` : "Here's your next play.",
    `${game.away} at ${game.home} · ${date} ${time}`,
    "",
    `${twoLegs ? "1) " : ""}${fixedBook}: ${game.fixedTeam} ${game.fixedAmerican}. Bet ${fmt(t.fixedStake)}${t.fixedNote ? ` (${t.fixedNote})` : ""}`,
    ...(game.fixedLink ? [game.fixedLink] : []),
    ...(!twoLegs ? [] : [
      "",
      `2) ${game.hedgeBookName}: ${game.hedgeTeam} ${game.hedgeAmerican}. Bet ${fmt(clientHedge)}`,
      ...(game.hedgeLink ? [game.hedgeLink] : []),
    ]),
    "",
    !twoLegs ? "Place it before game time and send me a screenshot of the bet slip." : "Place both before game time and send me screenshots of each bet slip.",
  ];
  return lines.join("\n");
}

export default function SendTicket({ game, fixedBookName, ticket }: { game: FinderGame; fixedBookName: string; ticket: Ticket }) {
  const [open, setOpen] = useState(false);
  const [clients, setClients] = useState<ClientRow[] | null>(null);
  const [clientId, setClientId] = useState("");
  const [log, setLog] = useState(true);
  const [selfHedge, setSelfHedge] = useState(false);
  const [myHedge, setMyHedge] = useState("");            // your part of the hedge when self hedging
  const [showAll, setShowAll] = useState(false);
  const [body, setBody] = useState("");
  const [edited, setEdited] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [loggedFor, setLoggedFor] = useState<string | null>(null);
  const boxRef = useRef<HTMLTextAreaElement | null>(null);

  const client = useMemo(() => clients?.find(c => c.id === clientId), [clients, clientId]);
  const listed = useMemo(() => (clients || []).filter(c => showAll || c.status === "active" || c.id === clientId), [clients, showAll, clientId]);
  const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
  const mine = selfHedge ? Math.max(0, Math.min(ticket.hedgeStake, myHedge === "" ? ticket.hedgeStake : parseFloat(myHedge) || 0)) : 0;
  const clientHedge = Math.max(0, ticket.hedgeStake - mine);
  const firstName = client?.name.split(" ")[0];

  useEffect(() => {
    if (!open || clients) return;
    (async () => {
      try {
        const { data, error } = await (await db()).from("clients").select("id,name,phone,approved_books,status").order("name");
        if (error) throw error;
        setClients(data || []);
      } catch {
        setClients([]);
      }
    })();
  }, [open, clients]);

  // Keep the draft in sync until the user edits it by hand.
  const ticketKey = JSON.stringify(ticket);
  useEffect(() => {
    if (!edited) setBody(buildMessage(game, fixedBookName, ticket, firstName, clientHedge));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.id, game.fixedAmerican, game.hedgeAmerican, fixedBookName, ticketKey, firstName, edited, clientHedge]);

  const logPlay = async () => {
    if (!client || !log) return true;
    if (loggedFor === client.id) return true; // don't double-log if Messages is opened twice
    setLoggedFor(client.id);
    try {
      const sb = await db();
      const { data: play, error } = await sb.from("plays").insert({
        client_id: client.id,
        promo: `${fixedBookName} ${ticket.amount ? fmt(ticket.amount) + " " : ""}${ticket.type.toLowerCase()}`,
        promo_type: ticket.type,
        book: fixedBookName,
        status: "open",
        placed_on: new Date().toISOString().split("T")[0],
        notes: `${game.away} at ${game.home}`,
      }).select("id").single();
      if (error) throw error;
      const event_time = game.commence ? localIso(new Date(game.commence)) : null;
      const hedgeLeg = (cash: number, self: boolean) => ({
        play_id: play!.id, seq: 1, side: "hedge", book: game.hedgeBookName, self_hedge: self,
        selection: game.hedgeTeam, odds: game.hedgeAmerican,
        cash_stake: r2(cash), credit_stake: 0, payout: r2(cash * game.hedgeDecimal), result: "pending", event_time,
      });
      const rows: any[] = [
        { play_id: play!.id, seq: 1, side: "promo", book: fixedBookName, self_hedge: false,
          selection: game.fixedTeam, odds: game.fixedAmerican,
          cash_stake: ticket.fixedIsCredit ? 0 : r2(ticket.fixedStake), credit_stake: ticket.fixedIsCredit ? r2(ticket.fixedStake) : 0,
          payout: r2(ticket.fixedPayout), result: "pending", event_time },
      ];
      if (clientHedge > 0.005) rows.push(hedgeLeg(clientHedge, false));
      if (mine > 0.005) rows.push(hedgeLeg(mine, true));
      const { error: legErr } = await sb.from("legs").insert(rows);
      if (legErr) throw legErr;
      // Your self hedge goes on the loan, same as sending the client money.
      if (mine > 0.005) {
        const { error: mvErr } = await sb.from("capital_movements").insert({
          client_id: client.id, play_id: play!.id, type: "self_hedge_stake", amount: r2(mine),
          date: new Date().toISOString().split("T")[0],
          notes: `${game.hedgeBookName} ${game.hedgeTeam} ${game.hedgeAmerican} (pays ${fmt(mine * game.hedgeDecimal)})`,
        });
        if (mvErr) throw mvErr;
      }
      setStatus(`Logged to ${client.name}`);
      return true;
    } catch (e: any) {
      setLoggedFor(null);
      setStatus(`Couldn't log to ${client.name}: ${e?.message || "database error"}`);
      return false;
    }
  };

  // Messages opens from a real link click (browsers block app launches that
  // happen after an await); logging runs in the background.
  const onOpenMessages = () => { void logPlay(); };

  const copy = async () => {
    const ok = await copyText(body, boxRef.current);
    setStatus(ok ? "Message copied" : "Text selected. Press Cmd+C to copy");
  };

  if (!open) {
    return (
      <button className="btn-ghost" onClick={() => setOpen(true)}>Send to client</button>
    );
  }

  return (
    <div className="divider" style={{ marginTop: 12, paddingTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 12, alignItems: "end" }}>
        <div>
          <span className="label">Client</span>
          <select className="input" value={clientId} onChange={e => setClientId(e.target.value)}>
            <option value="">{clients === null ? "Loading…" : listed.length ? (showAll ? "Choose a client" : "Choose an active client") : "No active clients"}</option>
            {listed.map(c => <option key={c.id} value={c.id}>{c.name}{c.status !== "active" ? " (inactive)" : ""}</option>)}
          </select>
        </div>
        <label className="tog" style={{ paddingBottom: 8 }}>
          <input type="checkbox" checked={log} onChange={e => setLog(e.target.checked)} style={{ accentColor: "var(--accent)" }} />
          <span style={{ color: "var(--text-2)", fontSize: 13 }}>Log to client</span>
        </label>
        <label className="tog" style={{ paddingBottom: 8 }}>
          <input type="checkbox" checked={selfHedge} onChange={e => { setSelfHedge(e.target.checked); setMyHedge(""); setEdited(false); }} style={{ accentColor: "var(--accent)" }} />
          <span style={{ color: "var(--text-2)", fontSize: 13 }}>Hedge in my account</span>
        </label>
      </div>
      <label className="tog" style={{ marginTop: -4 }}>
        <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} style={{ accentColor: "var(--accent)" }} />
        <span style={{ color: "var(--muted)", fontSize: 12 }}>Show inactive clients</span>
      </label>

      {selfHedge && (
        <div className="card" style={{ background: "var(--surface-2)", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, alignItems: "end" }}>
          <div>
            <span className="label">My hedge stake</span>
            <input className="input num" inputMode="decimal" value={myHedge} placeholder={r2(ticket.hedgeStake).toFixed(2)}
              onChange={e => { setMyHedge(e.target.value); setEdited(false); }} />
          </div>
          <div>
            <div className="stat-label">Pays if it wins</div>
            <div className="stat-value num">{fmt(mine * game.hedgeDecimal)}</div>
          </div>
          <div>
            <div className="stat-label">Client hedges</div>
            <div className="stat-value num">{fmt(clientHedge)}</div>
          </div>
          <div>
            <div className="stat-label">Added to loan</div>
            <div className="stat-value num">{fmt(mine)}</div>
          </div>
        </div>
      )}

      <div>
        <span className="label">Message</span>
        <textarea
          ref={boxRef}
          className="input" rows={9} value={body}
          onChange={e => { setBody(e.target.value); setEdited(true); }}
          style={{ resize: "vertical", fontSize: 13, lineHeight: 1.5 }}
        />
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <a className="btn-primary" style={{ width: "auto", padding: "8px 14px", display: "inline-block" }}
           href={smsHref(client?.phone, body)} onClick={onOpenMessages}>
          Open in Messages
        </a>
        <button className="btn-ghost" onClick={copy}>Copy text</button>
        {edited && <button className="btn-ghost" onClick={() => setEdited(false)}>Reset</button>}
        <button className="btn-ghost" onClick={() => { setOpen(false); setStatus(null); }}>Close</button>
        {status && <span style={{ color: "var(--text-2)", fontSize: 12 }}>{status}</span>}
      </div>
      {client && (client.approved_books?.length ?? 0) > 0 && !client.approved_books!.includes(fixedBookName) && (
        <div className="hint" style={{ marginTop: 0, color: "var(--warn)" }}>{client.name} isn't marked as approved on {fixedBookName}.</div>
      )}
      {client && !client.phone && <div className="hint" style={{ marginTop: 0 }}>{client.name} has no phone number saved, so Messages will open without a recipient.</div>}
    </div>
  );
}
