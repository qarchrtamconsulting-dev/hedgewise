export const BOOKS = ["FanDuel","DraftKings","BetMGM","Caesars","theScore Bet","Bet365","Hard Rock","BetRivers","Fanatics"];
/** Books the odds feed covers (The Odds API has no US Bet365 data). */
export const ODDS_BOOKS = BOOKS.filter(b => b !== "Bet365");
export const LEAGUES = ["NBA","MLB","NHL","NFL","NCAAB","NCAAF"];
export const PROMO_TYPES = ["Free Bet","Risk Free","Profit Boost","Low Hold","Deposit Match","Reload","Refer-a-Friend","Odds Boost"];
export const STAGES = ["Active","Pending","Graded - Win","Graded - Loss","Withdrawn","Flagged"];

// The Odds API bookmaker keys -> our names. Caesars is listed as William Hill;
// theScore Bet still uses its old ESPN BET key.
export const BOOK_MAP: Record<string,string> = {
  fanduel:"FanDuel", draftkings:"DraftKings", betmgm:"BetMGM",
  williamhill_us:"Caesars", espnbet:"theScore Bet", hardrockbet:"Hard Rock",
  betrivers:"BetRivers", fanatics:"Fanatics"
};
export const LEAGUE_SPORT: Record<string,string> = {
  NBA:"basketball_nba", MLB:"baseball_mlb",
  NHL:"icehockey_nhl", NFL:"americanfootball_nfl",
  NCAAB:"basketball_ncaab", NCAAF:"americanfootball_ncaaf"
};

export const toDec = (am: string|number) => {
  const n = parseFloat(am as string);
  if (isNaN(n)) return null;
  return n > 0 ? n/100+1 : 100/Math.abs(n)+1;
};
export const toAm = (d: number) => d >= 2 ? `+${Math.round((d-1)*100)}` : `-${Math.round(100/(d-1))}`;
export const fmt = (n: number) => `$${Math.abs(n).toFixed(2)}`;
export const mkHold = (d1: number, d2: number) => ((1/d1)+(1/d2)-1)*100;
export const holdColor = (h: number) => h < 1.5 ? "var(--pos)" : h < 3.5 ? "var(--warn)" : "var(--neg)";
