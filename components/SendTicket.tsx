"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { FinderGame } from "./useGameFinder";
import { fmt } from "@/lib/constants";
import { copyText } from "@/lib/clipboard";

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
}

interface ClientRow { id: string; name: string; phone: string | null }

async function db() {
  const { supabase } = await import("@/lib/supabase");
  return supabase;
}

// "sms:NUMBER?&body=TEXT" is the form both iPhone and Mac Messages accept.
const smsHref = (phone: string | null | undefined, body: string) => {
  let digits = (phone || "").replace(/[^\d+]/g, "");
  if (/^\d{10}$/.test(digits)) digits = `+1${digits}`;
  return `sms:${digits}?&body=${encodeURIComponent(body)}`;
};


export function buildMessage(game: FinderGame, fixedBook: string, t: Ticket, firstName?: string) {
  const when = new Date(game.commence);
  const date = when.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  const time = when.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const lines = [
    `${firstName ? `Hey ${firstName}, ` : ""}here's your next play.`,
    `${game.away} at ${game.home} · ${date} ${time}`,
    "",
    `1) ${fixedBook}: ${game.fixedTeam} ${game.fixedAmerican}. Bet ${fmt(t.fixedStake)}${t.fixedNote ? ` (${t.fixedNote})` : ""}`,
    ...(game.fixedLink ? [game.fixedLink] : []),
    "",
    `2) ${game.hedgeBookName}: ${game.hedgeTeam} ${game.hedgeAmerican}. Bet ${fmt(t.hedgeStake)}`,
    ...(game.hedgeLink ? [game.hedgeLink] : []),
    "",
    "Place both before game time and send me screenshots of each bet slip.",
  ];
  return lines.join("\n");
}

export default function SendTicket({ game, fixedBookName, ticket }: { game: FinderGame; fixedBookName: string; ticket: Ticket }) {
  const [open, setOpen] = useState(false);
  const [clients, setClients] = useState<ClientRow[] | null>(null);
  const [clientId, setClientId] = useState("");
  const [log, setLog] = useState(true);
  const [body, setBody] = useState("");
  const [edited, setEdited] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [loggedFor, setLoggedFor] = useState<string | null>(null);
  const boxRef = useRef<HTMLTextAreaElement | null>(null);

  const client = useMemo(() => clients?.find(c => c.id === clientId), [clients, clientId]);
  const firstName = client?.name.split(" ")[0];

  useEffect(() => {
    if (!open || clients) return;
    (async () => {
      try {
        const { data, error } = await (await db()).from("clients").select("id,name,phone").order("name");
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
    if (!edited) setBody(buildMessage(game, fixedBookName, ticket, firstName));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.id, game.fixedAmerican, game.hedgeAmerican, fixedBookName, ticketKey, firstName, edited]);

  const logPlay = async () => {
    if (!client || !log) return true;
    if (loggedFor === client.id) return true; // don't double-log if Messages is opened twice
    setLoggedFor(client.id);
    try {
      const { error } = await (await db()).from("promos").insert({
        client_id: client.id,
        book: fixedBookName,
        type: ticket.type,
        amount: ticket.amount,
        status: "Active",
        profit: Math.round(ticket.expected * 100) / 100,
        date: new Date().toISOString().split("T")[0],
        notes: `${game.away} at ${game.home} | ${fixedBookName} ${game.fixedTeam} ${game.fixedAmerican} ${fmt(ticket.fixedStake)} / ${game.hedgeBookName} ${game.hedgeTeam} ${game.hedgeAmerican} ${fmt(ticket.hedgeStake)}`,
      });
      if (error) throw error;
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
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "end" }}>
        <div>
          <span className="label">Client</span>
          <select className="input" value={clientId} onChange={e => setClientId(e.target.value)}>
            <option value="">{clients === null ? "Loading…" : clients.length ? "Choose a client" : "No clients found"}</option>
            {clients?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <label className="tog" style={{ paddingBottom: 8 }}>
          <input type="checkbox" checked={log} onChange={e => setLog(e.target.checked)} style={{ accentColor: "var(--accent)" }} />
          <span style={{ color: "var(--text-2)", fontSize: 13 }}>Log to client</span>
        </label>
      </div>

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
      {client && !client.phone && <div className="hint" style={{ marginTop: 0 }}>{client.name} has no phone number saved, so Messages will open without a recipient.</div>}
    </div>
  );
}
