import type { FinderConfig } from "@/components/useGameFinder";

export type ToolKey = "lowhold" | "freebet" | "riskfree" | "boost";
export const TOOL_KEYS: ToolKey[] = ["lowhold", "freebet", "riskfree", "boost"];

/** Everything needed to reproduce a tool's setup. */
export interface PresetState {
  config: FinderConfig;
  inputs: Record<string, string | number>;
}

export interface Preset extends PresetState {
  id: string;
  name: string;
  tool: ToolKey;
  builtIn?: boolean;
}

const HEDGE = ["DraftKings", "BetMGM", "Caesars", "Fanatics"];
const HEDGE_FD = ["FanDuel", "BetMGM", "Caesars", "Fanatics"];
const LEAGUES = ["NBA", "MLB", "NHL", "NFL"];

const cfg = (fixedBook: string, min: string, max: string, hedgeBooks = fixedBook === "DraftKings" ? HEDGE_FD : HEDGE): FinderConfig => ({
  fixedBook, leagues: LEAGUES, hedgeBooks: hedgeBooks.filter(b => b !== fixedBook),
  fixedMinAmerican: min, fixedMaxAmerican: max, hideLive: true,
});

/** Starter presets modelled on the promos that show up most in the tracker. */
export const BUILT_IN: Preset[] = [
  // Low hold / min loss
  { id: "b-lh-fd", tool: "lowhold", name: "FanDuel min loss", config: cfg("FanDuel", "-200", "+200"), inputs: { cash: "500" }, builtIn: true },
  { id: "b-lh-dk", tool: "lowhold", name: "DraftKings min loss", config: cfg("DraftKings", "-200", "+200"), inputs: { cash: "500" }, builtIn: true },
  { id: "b-lh-mgm", tool: "lowhold", name: "BetMGM $1.5k", config: cfg("BetMGM", "-200", "+200"), inputs: { cash: "1500" }, builtIn: true },
  { id: "b-lh-365", tool: "lowhold", name: "Bet365 $1k", config: cfg("Bet365", "-200", "+200"), inputs: { cash: "1000" }, builtIn: true },
  { id: "b-lh-czr", tool: "lowhold", name: "Caesars $1k", config: cfg("Caesars", "-200", "+200"), inputs: { cash: "1000" }, builtIn: true },

  // Free bet
  { id: "b-fb-fd500", tool: "freebet", name: "FanDuel $500 free bet", config: cfg("FanDuel", "+200", "+800"), inputs: { amount: "500" }, builtIn: true },
  { id: "b-fb-fd1k", tool: "freebet", name: "FanDuel $1k free bet", config: cfg("FanDuel", "+200", "+800"), inputs: { amount: "1000" }, builtIn: true },
  { id: "b-fb-dk500", tool: "freebet", name: "DraftKings $500 free bet", config: cfg("DraftKings", "+200", "+800"), inputs: { amount: "500" }, builtIn: true },
  { id: "b-fb-dk1k", tool: "freebet", name: "DraftKings $1k free bet", config: cfg("DraftKings", "+200", "+800"), inputs: { amount: "1000" }, builtIn: true },

  // Risk free
  { id: "b-rf-fd500", tool: "riskfree", name: "FanDuel $500 risk free", config: cfg("FanDuel", "+200", "+1000"), inputs: { amount: "500", conv: 65 }, builtIn: true },
  { id: "b-rf-fd1k", tool: "riskfree", name: "FanDuel $1k risk free", config: cfg("FanDuel", "+200", "+1000"), inputs: { amount: "1000", conv: 65 }, builtIn: true },
  { id: "b-rf-br500", tool: "riskfree", name: "BetRivers $500 risk free", config: cfg("BetRivers", "+200", "+1000"), inputs: { amount: "500", conv: 65 }, builtIn: true },

  // Profit boost
  { id: "b-pb-fd25", tool: "boost", name: "FanDuel 25% boost", config: cfg("FanDuel", "-200", "+300"), inputs: { stake: "100", boost: "25", cap: "50" }, builtIn: true },
  { id: "b-pb-fd50", tool: "boost", name: "FanDuel 50% boost", config: cfg("FanDuel", "-200", "+300"), inputs: { stake: "100", boost: "50", cap: "100" }, builtIn: true },
  { id: "b-pb-dk50", tool: "boost", name: "DraftKings 50% boost", config: cfg("DraftKings", "-200", "+300"), inputs: { stake: "100", boost: "50", cap: "100" }, builtIn: true },
];

export const defaultPreset = (tool: ToolKey): Preset => BUILT_IN.find(p => p.tool === tool)!;

// ─── Share links ───────────────────────────────────────────────
// State is packed into the URL, so a link works on any device with no login.

const toB64Url = (s: string) =>
  btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64Url = (s: string) =>
  decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/"))));

export function shareUrl(tool: ToolKey, state: PresetState, name?: string): string {
  const payload = toB64Url(JSON.stringify({ c: state.config, i: state.inputs, n: name || undefined }));
  return `${window.location.origin}/tools?tool=${tool}&s=${payload}`;
}

export function readShareParams(search: string): { tool: ToolKey | null; state: PresetState | null; name?: string } {
  const q = new URLSearchParams(search);
  const t = q.get("tool") as ToolKey | null;
  const tool = t && TOOL_KEYS.includes(t) ? t : null;
  const s = q.get("s");
  if (!s) return { tool, state: null };
  try {
    const j = JSON.parse(fromB64Url(s));
    if (!j?.c || typeof j.c !== "object") return { tool, state: null };
    return { tool, state: { config: j.c, inputs: j.i || {} }, name: j.n };
  } catch {
    return { tool, state: null };
  }
}
