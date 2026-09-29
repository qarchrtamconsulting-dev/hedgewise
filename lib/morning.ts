// The morning list: every live client in start order, with the stage they're in and the labels that say
// what they need. Labels stack (a client can be on the $500 list and have an open bet); each is a tab.
import { money0 } from "@/lib/db";
import { PROMO_LAST_DAY, addDays, dayLabel, weekdayName } from "@/lib/cadence";
import { markKey } from "@/lib/ops";
import type { OpsEntry, OpsMark } from "@/lib/ops";
import { nextPromoDay, planFor } from "@/lib/promos";
import type { PromoPlan } from "@/lib/promos";
import { buildSignupMessage, offersFor } from "@/lib/playbook";

export type LabelKey = "promo" | "tsb" | "open" | "thescore" | "soon" | "collect" | "quiet" | "nofd";
export const LABEL_ORDER: LabelKey[] = ["promo", "tsb", "open", "thescore", "soon", "collect", "quiet", "nofd"];
export type StageKey = "day1" | "build" | "window" | "wrap" | "none";

export const STAGE_NAME: Record<StageKey, string> = { day1: "Day 1", build: "Build", window: "$500 window", wrap: "Wrap-up", none: "No FanDuel" };
export const stageOf = (day: number | null): StageKey =>
  day == null ? "none" : day <= 2 ? "day1" : day <= 7 ? "build" : day <= PROMO_LAST_DAY ? "window" : "wrap";

/** Kinds the Today checklist uses for the same job, so a text from either place checks off both. */
export const LABEL_TASKS: Partial<Record<LabelKey, string[]>> = { promo: ["fd_check_in"], tsb: ["tsb_match"], thescore: ["tsb_start"] };

export interface MorningRow {
  e: OpsEntry;
  plan: PromoPlan;
  day: number | null;
  stage: StageKey;
  labels: LabelKey[];
  next: string;
  nextTone?: "hot" | "warn";
  touched: boolean;
  sortKey: string;
  openN: number;
}

const first = (name: string) => name.split(" ")[0];
const wdShort = (iso: string) => weekdayName(iso).slice(0, 3);

export function whenWord(date: string, today: string) {
  if (date === today) return "today";
  if (date === addDays(today, 1)) return "tomorrow";
  return `on ${weekdayName(date)}`;
}

/** The label names as tabs, given today's next promo day. */
export function labelName(k: LabelKey, today: string) {
  const d = nextPromoDay(today);
  switch (k) {
    case "promo": return d === today ? "$500 today" : d === addDays(today, 1) ? "$500 tomorrow" : `$500 ${wdShort(d)}`;
    case "tsb": return "theScore $250";
    case "open": return "Open bet";
    case "thescore": return "Start theScore";
    case "soon": return "Starting soon";
    case "collect": return "Collect";
    case "quiet": return "Gone quiet";
    case "nofd": return "No FanDuel";
  }
}

export function morningRows(entries: OpsEntry[], marks: Map<string, OpsMark>, today: string): MorningRow[] {
  const promoDay = nextPromoDay(today);
  const marksToday = new Set<string>();
  marks.forEach(m => { if (m.kind === "touch" && m.due_on === today) marksToday.add(m.client_id); if (m.created_at && localDay(m.created_at) === today && m.status !== "skipped") marksToday.add(m.client_id); });

  return entries
    .filter(e => e.cad.startedOn || e.raw.length > 0)            // leads with nothing logged live on Onboarding
    .map(e => {
      const plan = planFor(e, today);
      const day = e.cad.startedOn ? e.cad.day : null;
      const stage = stageOf(day);
      const openPlays = e.raw.filter(p => p.status === "open" || p.status === "sent");
      const promoHit = plan.hits.find(h => h.kind === "fd500" && h.date === promoDay);
      const firstSoon = plan.hits.find(h => h.kind === "fd500" && h.first && h.date !== promoDay);
      const tsb = plan.hits.find(h => h.kind === "tsb250" && h.date <= addDays(today, 1));
      const labels: LabelKey[] = [];
      if (promoHit) labels.push("promo");
      if (tsb) labels.push("tsb");
      if (openPlays.length) labels.push("open");
      if (e.todo.some(t => t.kind === "tsb_start")) labels.push("thescore");
      if (!promoHit && firstSoon) labels.push("soon");
      if (e.collect) labels.push("collect");
      if (e.cad.lane === "quiet") labels.push("quiet");
      if (!e.cad.startedOn) labels.push("nofd");

      let next = "", nextTone: MorningRow["nextTone"];
      const top = labels[0];
      if (top === "promo" && promoHit) {
        const which = promoHit.n ? ` · #${promoHit.n}${promoHit.first ? ", first one" : promoHit.last ? ", last one" : ""}` : plan.missed ? " · none logged yet" : "";
        next = `$500 ${whenWord(promoDay, today).replace("on ", "")}${which}`; nextTone = plan.missed ? "warn" : "hot";
      } else if (top === "tsb" && tsb) {
        next = tsb.lateDays ? `theScore $250 · due ${tsb.lateDays}d ago` : `theScore $250 ${whenWord(tsb.date, today)}`; nextTone = "hot";
      } else if (top === "open") {
        next = `${openPlays[0].promo || "Play"} open${openPlays.length > 1 ? ` · +${openPlays.length - 1} more` : ""}`;
      } else if (top === "thescore") next = "Start theScore";
      else if (top === "soon" && firstSoon) next = `First $500 ${whenWord(firstSoon.date, today)}`;
      else if (top === "collect") next = `Collect ${money0(e.owes)}`;
      else if (top === "quiet") { next = e.cad.lastPlay ? `No play since ${dayLabel(e.cad.lastPlay)}` : "No plays yet"; nextTone = "warn"; }
      else if (top === "nofd") next = "No FanDuel bet yet";
      else if (e.cad.nextPromoOn) next = `Next $500 ${dayLabel(e.cad.nextPromoOn)}`;
      else next = stage === "wrap" ? "Wrap-up" : "Nothing due";

      const firstPlay = e.raw.map(p => p.placed_on).filter(Boolean).sort()[0] || "9999";
      const touched = marksToday.has(e.c.id) || e.raw.some(p => p.placed_on === today);
      return { e, plan, day, stage, labels, next, nextTone, touched, sortKey: `${e.cad.startedOn || firstPlay}|${e.c.name}`, openN: openPlays.length };
    })
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey));
}

const localDay = (iso: string) => { const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

/** The text for one label (or the client's top label). Relaxed, first name, no placeholders. */
export function textFor(r: MorningRow, k: LabelKey | undefined, today: string): string {
  const f = first(r.e.c.name);
  const promoDay = nextPromoDay(today);
  switch (k) {
    case "promo":
      return `Hey ${f}! You should be getting a $500 FanDuel promo ${whenWord(promoDay, today)}. Can you send me a screenshot of your FanDuel home screen when it shows up?`;
    case "soon": {
      const h = r.plan.hits.find(x => x.kind === "fd500" && x.first);
      return `Hey ${f}! Heads up, your first $500 FanDuel promo should land ${h ? whenWord(h.date, today) : "this week"}. I'll text you that morning`;
    }
    case "tsb": return `Hey ${f}, your theScore $250 match should be in. Can you send me a screenshot of theScore?`;
    case "open": return `Hey ${f}, can you send me a screenshot of your open bets when you get a sec?`;
    case "thescore": {
      const o = offersFor(r.e.c.state).find(x => /thescore/i.test(x.book));
      return o ? buildSignupMessage(f, [o], false, false) : `Hey ${f}! Next app is theScore, I'll send the link`;
    }
    case "collect": return `Hey ${f}! We're about wrapped up. Can you withdraw what's left on each app and Venmo me when it lands?`;
    case "quiet": return `Hey ${f}, just checking in, you still good to keep going?`;
    case "nofd": return `Hey ${f}! Did FanDuel ever let you verify? That one gets everything started`;
    default: return `Hey ${f}!`;
  }
}

export const smsHref = (phone: string | null | undefined, body: string) => {
  let digits = (phone || "").replace(/[^\d+]/g, "");
  if (/^\d{10}$/.test(digits)) digits = `+1${digits}`;
  return `sms:${digits}?&body=${encodeURIComponent(body)}`;
};

export { markKey };
