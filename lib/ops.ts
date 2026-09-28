"use client";
// Everything the Board and the tab counts need, loaded once and computed with the same cadence rules as Today.
import { Client, ClientSummary, fetchAll, getDb } from "@/lib/db";
import {
  CadencePlay, ClientCadence, PROMO_LAST_DAY, PlayLike, Task, addDays, cadenceFor, offerBooksOf, tasksForToday, toCadencePlay,
} from "@/lib/cadence";

export type OpsPlay = PlayLike & { id: string; client_id: string };
export interface OpsMark { client_id: string; kind: string; due_on: string; status: "texted" | "done" | "skipped"; created_at: string | null }

export interface OpsEntry {
  c: Client;
  cad: ClientCadence;
  plays: CadencePlay[];
  raw: OpsPlay[];
  /** Today's items still to do (not logged, not texted/done/skipped). */
  todo: Task[];
  owes: number;
  /** Not live yet: onboarding, or active with no FanDuel bet. */
  lead: boolean;
  collect: boolean;
}

export const markKey = (clientId: string, kind: string, dueOn: string) => `${clientId}|${kind}|${dueOn}`;

/** The columns on the Board, in the app's book spelling. */
export const BOARD_BOOKS = ["FanDuel", "DraftKings", "theScore Bet", "BetMGM", "Caesars", "BetRivers", "Fanatics"] as const;
export const bookShort = (b: string) => ({ FanDuel: "FD", DraftKings: "DK", "theScore Bet": "Score", BetMGM: "MGM", Caesars: "CZR", BetRivers: "BR", Fanatics: "FAN" } as Record<string, string>)[b] || b;

export async function loadOps(t: string) {
  const db = await getDb();
  const [cs, su, ps] = await Promise.all([
    fetchAll<Client>((a, b) => db.from("clients").select("id,name,phone,email,state,split,status,referred_by,notes,approved_books").range(a, b)),
    fetchAll<ClientSummary>((a, b) => db.from("client_summary").select("*").range(a, b)),
    fetchAll<OpsPlay>((a, b) => db.from("plays").select("id,client_id,status,promo,book,placed_on,legs(book,side,event_time)").neq("status", "void").range(a, b)),
  ]);
  let marks = new Map<string, OpsMark>();
  try {
    const ms = await fetchAll<OpsMark>((a, b) => db.from("task_marks").select("client_id,kind,due_on,status,created_at").gte("due_on", addDays(t, -60)).range(a, b));
    marks = new Map(ms.map(m => [markKey(m.client_id, m.kind, m.due_on), m]));
  } catch {}

  const byClient = new Map<string, OpsPlay[]>();
  ps.forEach(p => { const a = byClient.get(p.client_id) || []; a.push(p); byClient.set(p.client_id, a); });
  const sumBy = new Map(su.map(s => [s.client_id, s]));
  const n = (x: any) => Number(x) || 0;

  const entries: OpsEntry[] = cs.filter(c => c.status === "active" || c.status === "onboarding").map(c => {
    const raw = byClient.get(c.id) || [];
    const plays = raw.map(toCadencePlay);
    const cad = cadenceFor(plays, t);
    const s = sumBy.get(c.id);
    const owes = n(s?.loan_outstanding) + n(s?.your_share) - n(s?.received);
    const lead = !cad.startedOn;
    const todo = lead ? [] : tasksForToday(cad, plays, t).filter(tk => !tk.done && !marks.has(markKey(c.id, tk.kind, tk.dueOn)));
    // Same rule as Money → Collect.
    const collect = owes > 0.5 && c.status === "active" && (cad.lane === "wrap" || cad.lane === "quiet" || (cad.day != null && cad.day >= PROMO_LAST_DAY));
    return { c, cad, plays, raw, todo, owes, lead, collect };
  });
  return { entries, marks };
}

export type CellState = "open" | "sent" | "next" | "done" | "used" | "none";
export interface BookCell { book: string; state: CellState; offers: number; open: number; sent: number; plays: OpsPlay[] }

/** Which book a task is about. */
export const taskBook = (t: Task) => (t.kind.startsWith("tsb") ? "theScore Bet" : "FanDuel");

/** One cell per Board column: offers played on that book, open or unconfirmed bets, and what's next. */
export function bookCells(e: OpsEntry): BookCell[] {
  const nextBook = e.todo.length ? taskBook(e.todo[0]) : null;
  return BOARD_BOOKS.map(book => {
    const mine = e.raw.filter(p => offerBooksOf(toCadencePlay(p)).includes(book));
    const touched = e.raw.some(p => (p.legs || []).some(l => l.book === book) || p.book === book);
    const open = mine.filter(p => p.status === "open").length;
    const sent = mine.filter(p => p.status === "sent").length;
    const offers = mine.filter(p => p.status === "settled" || p.status === "open").length;
    const state: CellState = open ? "open" : sent ? "sent" : nextBook === book ? "next" : offers ? "done" : touched ? "used" : "none";
    return { book, state, offers, open, sent, plays: mine };
  });
}
