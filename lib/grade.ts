// Grading bets from final scores (The Odds API scores endpoint).
// Plain functions with no imports, so the matching can be checked on its own.
//
// A play is graded only when every pair can be matched to one finished game with confidence:
//  - moneyline: the team that won
//  - spread ("Chargers -19.5"): the side that covered, push on an exact line
//  - total ("O10.5" / "under 8.5"): over or under, push on an exact total
// Props, parlays, soccer draws and anything ambiguous are left for a manual tap.

export interface ScoreEvent {
  id: string;
  sport_key: string;
  commence_time: string;          // ISO, UTC
  completed: boolean;
  home_team: string;
  away_team: string;
  scores: { name: string; score: string }[] | null;
}
export type Pick = "promo" | "hedge" | "void";
export interface GradeLeg {
  seq: number;
  side: "promo" | "hedge";
  selection: string | null;
  event_time: string | null;      // local wall-clock time, no zone
  odds_event_id?: string | null;
  result?: string | null;         // pending | won | lost | void
}
export interface GradePlay { placed_on: string | null; notes?: string | null }

type Kind = "ml" | "spread" | "total" | "unknown";
interface Parsed { kind: Kind; team: string; line: number | null; ou: "over" | "under" | null }

const PROP = /\b(hr|home ?runs?|pts|points|yds|yards|rebounds?|reb|assists?|ast|strikeouts?|ks?|hits?|td|tds|touchdowns?|sog|shots|goals?|anytime|rbis?|passing|rushing|receiving|1st|first|half|quarter|q1|inning|parlay|sgp)\b/i;
const NOISE = new Set(["ml", "moneyline", "money", "line", "to", "win", "wins", "the", "vs", "v", "at", "game"]);

const clean = (s: string) => s.toLowerCase()
  .replace(/[’'`]/g, "")
  .replace(/−|–|—/g, "-")
  .replace(/[^a-z0-9.+\- /]/g, " ")
  .replace(/\s+/g, " ").trim();

/** What kind of bet a selection is, and on whom. */
export function parseSelection(sel: string | null | undefined): Parsed {
  const s = clean(sel || "");
  if (!s || s.includes(",") || PROP.test(s)) return { kind: "unknown", team: "", line: null, ou: null };
  const tot = /(?:^|\s)(o|u|over|under)\s*(\d+(?:\.\d+)?)(?:\s|$)/.exec(s) || /(?:^|\s)(o|u)(\d+(?:\.\d+)?)(?:\s|$)/.exec(s);
  if (tot && !/o\s*\/\s*u/.test(s)) {
    return { kind: "total", team: s.replace(tot[0], " ").trim(), line: parseFloat(tot[2]), ou: tot[1].startsWith("o") ? "over" : "under" };
  }
  const spr = /(?:^|\s)([+-]\d+(?:\.\d+)?)(?:\s|$)/.exec(s);
  if (spr) return { kind: "spread", team: s.replace(spr[0], " ").trim(), line: parseFloat(spr[1]), ou: null };
  if (/\d+\.\d/.test(s)) return { kind: "unknown", team: "", line: null, ou: null };
  return { kind: "ml", team: s, line: null, ou: null };
}

// Common city shorthand in bet slips ("la dodgers", "ny jets").
const SHORT: Record<string, string> = {
  la: "los angeles", ny: "new york", sf: "san francisco", tb: "tampa bay", kc: "kansas city", gb: "green bay", lv: "las vegas",
  stl: "st louis", chi: "chicago", phi: "philadelphia", philly: "philadelphia", det: "detroit", bos: "boston", sd: "san diego",
  sea: "seattle", atl: "atlanta", cle: "cleveland", cin: "cincinnati", mil: "milwaukee", pit: "pittsburgh", bal: "baltimore",
  wsh: "washington", hou: "houston", tor: "toronto", ari: "arizona", nyy: "new york yankees", nym: "new york mets",
};
const tokens = (s: string) => clean(s).split(/[ /]/).flatMap(t => (SHORT[t] ? SHORT[t].split(" ") : [t])).filter(t => t && !NOISE.has(t));

/** 1 when every word of the selection matches (as the start of) a word of the team's name. */
export function teamMatch(text: string, team: string): number {
  const want = tokens(text);
  if (!want.length) return 0;
  const have = tokens(team);
  const used = new Set<number>();
  let hit = 0;
  for (const w of want) {
    const i = have.findIndex((h, j) => !used.has(j) && (h === w || (w.length >= 3 && h.startsWith(w)) || (w === "st" && (h === "state" || h === "saint"))));
    if (i >= 0) { used.add(i); hit++; }
  }
  return hit / want.length;
}

const scoreOf = (e: ScoreEvent, team: string) => {
  const s = (e.scores || []).find(x => x.name === team);
  return s ? parseFloat(s.score) : NaN;
};
type Side = "home" | "away";
const sideOf = (text: string, e: { home_team: string; away_team: string }): Side | null => {
  const h = teamMatch(text, e.home_team), a = teamMatch(text, e.away_team);
  if (h === 1 && a < 1) return "home";
  if (a === 1 && h < 1) return "away";
  return null;
};

/** Grade one pair (promo leg vs hedge leg). legTime is the game's start in ms, if known. */
export function gradePair(promo: GradeLeg, hedge: GradeLeg | null, events: ScoreEvent[], legTime: number | null, hint?: string | null):
  { pick: Pick; event: ScoreEvent; summary: string } | null {
  const P = parseSelection(promo.selection);
  const H = hedge ? parseSelection(hedge.selection) : { kind: "unknown" as Kind, team: "", line: null, ou: null };
  if (P.kind === "unknown") return null;
  if (H.kind !== "unknown" && H.kind !== P.kind) return null;

  const done = events.filter(e => e.completed && e.scores && e.scores.length >= 2);
  const near = (e: ScoreEvent) => legTime == null || Math.abs(Date.parse(e.commence_time) - legTime) <= 12 * 3600e3;

  // Which finished game this pair was on.
  let event: ScoreEvent | null = null;
  let pSide: Side | null = null, hSide: Side | null = null;
  const byId = promo.odds_event_id || hedge?.odds_event_id;
  if (byId) {
    event = done.find(e => e.id === byId) || null;
    if (!event) return null;          // that exact game isn't final yet (never grade it off another game)
  }
  const candidates = event ? [event] : done.filter(near);
  const found: { e: ScoreEvent; p: Side | null; h: Side | null }[] = [];
  for (const e of candidates) {
    const p = P.team ? sideOf(P.team, e) : null;
    const h = H.team ? sideOf(H.team, e) : null;
    const hintHit = !!hint && teamMatch(e.home_team, hint) === 1 && teamMatch(e.away_team, hint) === 1;
    if (P.kind === "total") {
      if (byId || hintHit || (p && (!h || h !== p)) || (h && !p)) found.push({ e, p, h });
    } else if (p && h ? p !== h : !!(p || h)) {
      found.push({ e, p, h });
    }
  }
  if (!event) {
    if (found.length !== 1) return null;
    event = found[0].e;
  }
  const f = found.find(x => x.e.id === event!.id);
  pSide = f?.p || null; hSide = f?.h || null;

  const hs = scoreOf(event, event.home_team), as = scoreOf(event, event.away_team);
  if (isNaN(hs) || isNaN(as)) return null;
  const soccer = event.sport_key.startsWith("soccer");
  const final = `${event.away_team} ${as}, ${event.home_team} ${hs}`;
  const other = (s: Side): Side => (s === "home" ? "away" : "home");

  let pick: Pick;
  if (P.kind === "ml") {
    if (hs === as) { if (soccer) return null; pick = "void"; }
    else {
      const winner: Side = hs > as ? "home" : "away";
      const promoSide = pSide || (hSide ? other(hSide) : null);
      if (!promoSide) return null;
      pick = promoSide === winner ? "promo" : "hedge";
    }
  } else if (P.kind === "spread") {
    const promoSide = pSide || (hSide ? other(hSide) : null);
    if (!promoSide || P.line == null) return null;
    if (H.kind === "spread" && H.line != null && Math.abs(H.line + P.line) > 0.001) return null;   // not the mirror line
    const mine = promoSide === "home" ? hs : as, theirs = promoSide === "home" ? as : hs;
    const margin = mine + P.line - theirs;
    pick = margin === 0 ? "void" : margin > 0 ? "promo" : "hedge";
  } else {
    if (P.line == null || !P.ou) return null;
    if (H.kind === "total" && (H.line !== P.line || H.ou === P.ou)) return null;          // not the other side of the same total
    const total = hs + as;
    pick = total === P.line ? "void" : (total > P.line) === (P.ou === "over") ? "promo" : "hedge";
  }
  const won = pick === "void" ? "push" : `${(pick === "promo" ? promo.selection : hedge?.selection) || (pick === "promo" ? "bet" : "hedge")} won`;
  return { pick, event, summary: `${final} · ${won}` };
}

export interface GameRef { id: string; sport_key: string; commence_time: string; home_team: string; away_team: string }

/** The one listed game (in progress or upcoming) a pair is on: both named teams must be in it, on opposite
 *  sides, starting within 6 hours of the bet's game time. Stricter than grading, since a wrong match here
 *  would move a bet to Needs a result early. */
export function findGame(promo: GradeLeg | null, hedge: GradeLeg | null, games: GameRef[], legTime: number | null): GameRef | null {
  if (legTime == null) return null;
  const P = parseSelection(promo?.selection), H = parseSelection(hedge?.selection);
  if (!P.team && !H.team) return null;
  const hits = games.map(g => {
    const dt = Math.abs(Date.parse(g.commence_time) - legTime);
    if (!(dt <= 6 * 3600e3)) return null;
    const p = P.team ? sideOf(P.team, g) : null;
    const h = H.team ? sideOf(H.team, g) : null;
    if ((P.team && !p) || (H.team && !h)) return null;
    if (p && h && p === h && P.kind !== "total") return null;
    return { g, dt };
  }).filter((x): x is { g: GameRef; dt: number } => !!x).sort((a, b) => a.dt - b.dt);
  if (!hits.length) return null;
  // Same teams twice (a doubleheader): only when one start is clearly the closer one.
  if (hits.length > 1 && hits[1].dt - hits[0].dt < 2 * 3600e3) return null;
  return hits[0].g;
}

/** Grade a whole play: every pair must match, or nothing is returned. */
export function gradePlay(play: GradePlay, legs: GradeLeg[], events: ScoreEvent[], toMs: (local: string) => number):
  { winners: Record<number, Pick>; summary: string } | null {
  const seqs = Array.from(new Set(legs.map(l => l.seq))).sort((a, b) => a - b);
  if (!seqs.length) return null;
  const winners: Record<number, Pick> = {};
  const lines: string[] = [];
  for (const q of seqs) {
    // A pair that already has a result keeps it (e.g. a risk-free first leg graded days ago).
    const done = legs.filter(l => l.seq === q && l.result && l.result !== "pending");
    if (done.length) {
      const pick: Pick = done.some(l => l.result === "void") ? "void" : done.some(l => l.side === "promo" && l.result === "won") ? "promo" : "hedge";
      winners[q] = pick;
      continue;
    }
    const promo = legs.find(l => l.seq === q && l.side === "promo" && l.selection);
    const hedge = legs.find(l => l.seq === q && l.side === "hedge" && l.selection) || null;
    if (!promo) return null;
    const t = promo.event_time || hedge?.event_time;
    const legTime = t ? toMs(t) : play.placed_on ? toMs(`${play.placed_on}T19:00:00`) : null;
    const g = gradePair(promo, hedge, events, legTime, play.notes);
    if (!g) return null;
    winners[q] = g.pick;
    lines.push(seqs.length > 1 ? `Pair ${q}: ${g.summary}` : g.summary);
  }
  if (!lines.length) return null;          // nothing new to grade
  return { winners, summary: lines.join("; ") };
}
