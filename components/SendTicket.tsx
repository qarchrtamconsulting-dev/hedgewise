"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { FinderGame } from "./useGameFinder";
import { LEAGUE_SPORT, fmt } from "@/lib/constants";
import { copyText } from "@/lib/clipboard";
import { Leg, Play, getDb, localIso, today } from "@/lib/db";
import Receipt from "./Receipt";

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
    firstName ? `Hey ${firstName}! Here's the next one:` : "Hey! Here's the next one:",
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
    !twoLegs ? "Get it in before the game and send me a screenshot of the slip when you get a sec. Thanks!" : "Get both in before the game and send me a screenshot of each slip when you get a sec. Thanks!",
  ];
  return lines.join("\n");
}

const IconLog = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 15V3" /><path d="M7 8l5-5 5 5" /><path d="M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
  </svg>
);
const IconSend = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
  </svg>
);

type Mode = null | "log" | "send";

/**
 * Two separate actions on each game card:
 *  - Log to client: saves the play to the client (then check the numbers and confirm).
 *  - Send to client: opens Messages with the text filled in. Saves nothing.
 */
export default function SendTicket({ game, fixedBookName, ticket }: { game: FinderGame; fixedBookName: string; ticket: Ticket }) {
  const [mode, setMode] = useState<Mode>(null);
  const [clients, setClients] = useState<ClientRow[] | null>(null);
  const [clientId, setClientId] = useState("");
  const [selfHedge, setSelfHedge] = useState(false);
  const [myHedge, setMyHedge] = useState("");            // your part of the hedge when self hedging
  const [showAll, setShowAll] = useState(false);
  const [body, setBody] = useState("");
  const [edited, setEdited] = useState(false);
  const [showText, setShowText] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [texted, setTexted] = useState<string | null>(null);   // client id texted this session
  // The saved play waiting for you to check the numbers and confirm.
  const [saved, setSaved] = useState<{ play: Play; legs: Leg[] } | null>(null);
  const boxRef = useRef<HTMLTextAreaElement | null>(null);

  const client = useMemo(() => clients?.find(c => c.id === clientId), [clients, clientId]);
  const listed = useMemo(() => (clients || []).filter(c => showAll || c.status === "active" || c.id === clientId), [clients, showAll, clientId]);
  const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
  const mine = selfHedge ? Math.max(0, Math.min(ticket.hedgeStake, myHedge === "" ? ticket.hedgeStake : parseFloat(myHedge) || 0)) : 0;
  const clientHedge = Math.max(0, ticket.hedgeStake - mine);
  const firstName = client?.name.split(" ")[0];

  // Coming from a Today checklist item (/tools?client=ID): start with that client picked.
  useEffect(() => {
    if (!mode || clientId) return;
    const want = new URLSearchParams(window.location.search).get("client");
    if (want) setClientId(want);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    if (!mode || clients) return;
    (async () => {
      try {
        const { data, error } = await (await db()).from("clients").select("id,name,phone,approved_books,status").order("name");
        if (error) throw error;
        setClients(data || []);
      } catch {
        setClients([]);
      }
    })();
  }, [mode, clients]);

  // Keep the text in sync until it's edited by hand.
  const ticketKey = JSON.stringify(ticket);
  useEffect(() => {
    if (!edited) setBody(buildMessage(game, fixedBookName, ticket, firstName, clientHedge));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.id, game.fixedAmerican, game.hedgeAmerican, fixedBookName, ticketKey, firstName, edited, clientHedge]);

  const logBet = async () => {
    if (!client || busy) return;
    if (saved && saved.play.client_id === client.id) return; // already saved, confirm below
    setBusy(true); setStatus(null);
    try {
      const sb = await db();
      const { data: play, error } = await sb.from("plays").insert({
        client_id: client.id,
        promo: `${fixedBookName} ${ticket.amount ? fmt(ticket.amount) + " " : ""}${ticket.type.toLowerCase()}`,
        promo_type: ticket.type,
        book: fixedBookName,
        status: "sent",
        placed_on: today(),
        notes: `${game.away} at ${game.home}`,
      }).select("*").single();
      if (error) throw error;
      const event_time = game.commence ? localIso(new Date(game.commence)) : null;
      // The Odds API game and sport, so the bet can be graded from the final score automatically.
      const game_ref = { odds_event_id: game.id || null, sport_key: (game.league && LEAGUE_SPORT[game.league]) || null };
      const hedgeLeg = (cash: number, self: boolean) => ({
        play_id: play!.id, seq: 1, side: "hedge", book: game.hedgeBookName, self_hedge: self,
        selection: game.hedgeTeam, odds: game.hedgeAmerican,
        cash_stake: r2(cash), credit_stake: 0, payout: r2(cash * game.hedgeDecimal), result: "pending", event_time, ...game_ref,
      });
      const rows: any[] = [
        { play_id: play!.id, seq: 1, side: "promo", book: fixedBookName, self_hedge: false,
          selection: game.fixedTeam, odds: game.fixedAmerican,
          cash_stake: ticket.fixedIsCredit ? 0 : r2(ticket.fixedStake), credit_stake: ticket.fixedIsCredit ? r2(ticket.fixedStake) : 0,
          payout: r2(ticket.fixedPayout), result: "pending", event_time, ...game_ref },
      ];
      if (clientHedge > 0.005) rows.push(hedgeLeg(clientHedge, false));
      if (mine > 0.005) rows.push(hedgeLeg(mine, true));
      const { data: legs, error: legErr } = await sb.from("legs").insert(rows).select("*");
      if (legErr) { await sb.from("plays").delete().eq("id", play!.id); throw legErr; }
      setSaved({ play: play as Play, legs: (legs || []) as Leg[] });
    } catch (e: any) {
      setStatus(`Couldn't save for ${client.name}: ${e?.message || "database error"}`);
    }
    setBusy(false);
  };

  const copy = async () => {
    const ok = await copyText(body, boxRef.current);
    setStatus(ok ? "Text copied. Nothing logged." : "Text selected. Press Cmd+C to copy");
  };

  const pick = (m: Mode) => { setMode(m); setStatus(null); };

  const actions = (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button className={mode === "log" ? "btn-primary" : "btn-ghost"} style={{ width: "auto", padding: "8px 14px", display: "inline-flex", alignItems: "center", gap: 8 }}
        onClick={() => pick(mode === "log" ? null : "log")} aria-pressed={mode === "log"}>
        <IconLog /> Log to client
      </button>
      <button className={mode === "send" ? "btn-primary" : "btn-ghost"} style={{ width: "auto", padding: "8px 14px", display: "inline-flex", alignItems: "center", gap: 8 }}
        onClick={() => pick(mode === "send" ? null : "send")} aria-pressed={mode === "send"}>
        <IconSend /> Send to client
      </button>
    </div>
  );

  if (!mode) return actions;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {actions}
      <div className="divider" style={{ paddingTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "end" }}>
          <div>
            <span className="label">Client</span>
            <select className="input" value={clientId} onChange={e => { setClientId(e.target.value); setStatus(null); }}>
              <option value="">{clients === null ? "Loading…" : listed.length ? (showAll ? "Choose a client" : "Choose an active client") : "No active clients"}</option>
              {listed.map(c => <option key={c.id} value={c.id}>{c.name}{c.status !== "active" ? " (inactive)" : ""}</option>)}
            </select>
          </div>
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

        {mode === "send" && (
          <>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              {client ? (
                <a className="btn-primary" style={{ width: "auto", padding: "8px 16px", display: "inline-block" }}
                   href={smsHref(client.phone, body)} onClick={() => { setTexted(client.id); setStatus(null); }}>
                  Text {firstName}
                </a>
              ) : (
                <button className="btn-primary" style={{ width: "auto", padding: "8px 16px" }} disabled>Pick a client</button>
              )}
              <button className="btn-ghost" onClick={() => setShowText(v => !v)}>{showText ? "Hide text" : "See / edit text"}</button>
              <button className="btn-ghost" onClick={copy}>Copy text</button>
              {edited && <button className="btn-ghost" onClick={() => setEdited(false)}>Reset text</button>}
            </div>
            {showText && (
              <textarea ref={boxRef} className="input" rows={9} value={body}
                onChange={e => { setBody(e.target.value); setEdited(true); }}
                style={{ resize: "vertical", fontSize: 13, lineHeight: 1.5 }} />
            )}
            {!showText && <textarea ref={boxRef} value={body} readOnly aria-hidden="true" tabIndex={-1}
              style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }} />}
            {client && texted === client.id && (
              <div className="hint" style={{ marginTop: 0 }}>
                Texted {firstName}. Nothing is logged yet. Once the bet's in,{" "}
                <button className="link" style={{ background: "none", border: 0, padding: 0, color: "var(--accent)", cursor: "pointer", font: "inherit" }}
                  onClick={() => pick("log")}>log it to {firstName}</button>.
              </div>
            )}
          </>
        )}

        {mode === "log" && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <button className="btn-primary" style={{ width: "auto", padding: "8px 16px" }} onClick={logBet}
              disabled={!client || busy || (!!saved && saved.play.client_id === client?.id)}>
              {!client ? "Pick a client" : busy ? "Saving…" : `Log bet for ${firstName}`}
            </button>
            <span className="task-sub">Check the numbers below, then confirm.</span>
          </div>
        )}

        {status && <span style={{ color: "var(--text-2)", fontSize: 12 }}>{status}</span>}
        {saved && client && saved.play.client_id === client.id && (
          <Receipt key={saved.play.id} play={saved.play} legs={saved.legs} clientName={client.name}
            onDone={r => { if (r === "discarded") setSaved(null); }} />
        )}
        {client && (client.approved_books?.length ?? 0) > 0 && !client.approved_books!.includes(fixedBookName) && (
          <div className="hint" style={{ marginTop: 0, color: "var(--warn)" }}>{client.name} isn&apos;t marked as approved on {fixedBookName}.</div>
        )}
        {mode === "send" && client && !client.phone && <div className="hint" style={{ marginTop: 0 }}>{client.name} has no phone number saved, so Messages will open without a recipient.</div>}
      </div>
    </div>
  );
}
