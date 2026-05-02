export const BOOKS = ["FanDuel","DraftKings","BetMGM","Caesars","Bet365","Hard Rock","BetRivers","Fanatics"];
export const LEAGUES = ["NBA","MLB","NHL","NFL","NCAAB","NCAAF"];
export const PROMO_TYPES = ["Free Bet","Risk Free","Profit Boost","Deposit Match","Reload","Refer-a-Friend","Odds Boost"];
export const STAGES = ["Active","Pending","Graded - Win","Graded - Loss","Withdrawn","Flagged"];

export const BOOK_MAP: Record<string,string> = {
  fanduel:"FanDuel", draftkings:"DraftKings", betmgm:"BetMGM",
  caesars:"Caesars", bet365:"Bet365", hardrockbet:"Hard Rock",
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
export const holdColor = (h: number) => h < 1 ? "#39ff14" : h < 2.5 ? "#ffd60a" : h < 4.5 ? "#ff9800" : "#ff4444";
