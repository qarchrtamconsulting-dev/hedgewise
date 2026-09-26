// Onboarding playbook: the apps you set clients up on, in the order you send them.
// Wording, promo codes, deposits and links come from your signup instructions doc.

export type OfferKind = "sportsbook" | "casino";

export interface Offer {
  key: string;
  book: string;             // matches BOOKS where possible
  kind: OfferKind;
  promo: string;            // "Bet $5 Get $250"
  promoType: string;        // Free Bet | Risk Free | Bet Match | Casino | Bonus
  deposit?: number;         // what the client deposits
  code?: string;            // promo or deposit code
  steps: string[];          // client-facing instructions
  link: string;             // App Store link
}

export const SIGNUP_RULES = [
  "Remember every password you create",
  "Use a Gmail address, not a school or work email",
  "Use the address on your license",
  "Don't use referral codes from friends to download the book",
  "Keep your license handy in case they ask for extra verification",
];

export const INTAKE_FORM = "https://docs.google.com/forms/d/e/1FAIpQLSdFfAnVqp-wQKgJMZ2zcUO_iQEE9nyUgrAI3Yd7ZIIkIqE3DA/viewform";

export const OFFERS: Offer[] = [
  { key: "fd-sb", book: "FanDuel", kind: "sportsbook", promo: "Bet $5 Get $250", promoType: "Free Bet",
    steps: ["Download and sign up. Choosing \"Join now\" and creating an account is easiest.", "Skip the deposit unless I tell you otherwise."],
    link: "https://apps.apple.com/us/app/fanduel-sportsbook-casino/id1413721906" },
  { key: "dk-sb", book: "DraftKings", kind: "sportsbook", promo: "Bet $5 Get $200 in Bonus Bets", promoType: "Free Bet",
    steps: ["Download and sign up. Choosing \"Join now\" and creating an account is easiest.", "Skip the deposit unless I tell you otherwise."],
    link: "https://apps.apple.com/us/app/draftkings-sports-casino/id1375031369" },
  { key: "tsb-sb", book: "theScore Bet", kind: "sportsbook", promo: "$1,000 Risk Free Bet", promoType: "Risk Free", deposit: 1000,
    steps: ["Download and sign up with the link below.", "Deposit $1,000 from Venmo or a debit card."],
    link: "https://apps.apple.com/us/app/thescore-bet-sportsbook-casino/id6463805689" },
  { key: "365-sb", book: "Bet365", kind: "sportsbook", promo: "$1,000 Risk Free Bet", promoType: "Risk Free", deposit: 1000,
    steps: ["Download and sign up. Let me know if you have any issues.",
      "After making the account, press Deposit in the top right.",
      "Enter $1,000, choose \"First Bet Safety Net - up to $1,000\", set Deposit Limit to \"No deposit limit\", then deposit."],
    link: "https://apps.apple.com/us/app/bet365-sportsbook-casino/id1465717844" },
  { key: "mgm-sb", book: "BetMGM", kind: "sportsbook", promo: "$1,500 Risk Free Bet", promoType: "Risk Free", deposit: 1500, code: "BETMGMBONUS",
    steps: ["Use promo code BETMGMBONUS. It's on the page after you enter your personal information. Press Apply and you'll see a green check mark.",
      "After signing up, deposit $1,500.", "Happy to jump on a call if you have questions."],
    link: "https://apps.apple.com/us/app/betmgm-sportsbook-casino/id1430875409" },
  { key: "czr-sb", book: "Caesars", kind: "sportsbook", promo: "$250 Bet Match", promoType: "Bet Match", deposit: 251,
    steps: ["Download and sign up.", "Choose the \"First bet matched up to $250\" promotion, then create your account.", "Deposit $251 from Venmo or a debit card."],
    link: "https://apps.apple.com/us/app/caesars-sportsbook/id1413099571" },
  { key: "br-sb", book: "BetRivers", kind: "sportsbook", promo: "$500 Risk Free Bet", promoType: "Risk Free", deposit: 500, code: "SPORTS",
    steps: ["Download and sign up.", "Go to Wallet at the top of the screen, select Deposit, enter promo code SPORTS, then deposit $500."],
    link: "https://apps.apple.com/us/app/betrivers-casino-sportsbook/id1635357259" },
  { key: "fan-sb", book: "Fanatics", kind: "sportsbook", promo: "10 Days of $100 Bet Match", promoType: "Bet Match",
    steps: ["Download and sign up with the link below.",
      "When it asks you to choose an offer, pick \"10 Days of $100 Bet Match, Win or Lose\" (the Most Popular one), then tap Confirm Selection. Screenshot: https://hedgewise-pied.vercel.app/guides/fanatics-offer.jpg"],
    link: "https://apps.apple.com/us/app/fanatics-sportsbook-casino/id1616738407" },
  { key: "hr-sb", book: "Hard Rock", kind: "sportsbook", promo: "Deposit offer", promoType: "Bonus", deposit: 500,
    steps: ["Download and sign up.", "Deposit $500 from Venmo or a debit card."],
    link: "https://apps.apple.com/us/app/hard-rock-bet-sportsbook/id1572525917" },

  // Casinos (only where online casino is legal)
  { key: "br-casino", book: "BetRivers Casino", kind: "casino", promo: "Casino offer", promoType: "Casino",
    steps: ["Download and sign up.", "Have your ID ready to verify your account."],
    link: "https://apps.apple.com/us/app/betrivers-casino-sportsbook/id1635357259" },
  { key: "tsb-casino", book: "theScore Casino", kind: "casino", promo: "$500 Casino Lossback", promoType: "Casino",
    steps: ["Download and sign up."],
    link: "https://apps.apple.com/us/app/thescore-bet-sportsbook-casino/id6463805689" },
  { key: "fan-casino", book: "Fanatics Casino", kind: "casino", promo: "$1,000 Casino Lossback", promoType: "Casino",
    steps: ["Download and sign up.", "Choose the \"Up to $1,000 Back in Casino Credit\" promotion."],
    link: "https://apps.apple.com/us/app/fanatics-casino-real-money/id6737852275" },
  { key: "hr-casino", book: "Hard Rock Casino", kind: "casino", promo: "$1,000 Casino Bonus", promoType: "Casino",
    steps: ["Download and sign up.", "Have your ID ready to verify your account."],
    link: "https://apps.apple.com/us/app/hard-rock-bet-casino/id6737067328" },
  { key: "borgata-casino", book: "Borgata Casino", kind: "casino", promo: "$500 Casino Bonus", promoType: "Casino",
    steps: ["Download and sign up.", "Have your ID ready to verify your account."],
    link: "https://apps.apple.com/us/app/borgata-casino-real-money/id756857928" },
  { key: "hollywood-casino", book: "Hollywood Casino", kind: "casino", promo: "$500 Lossback", promoType: "Casino",
    steps: ["Download and sign up."],
    link: "https://apps.apple.com/us/app/hollywood-casino-real-money/id6736526782" },
];

// States where your casino offers can be run. Among your clients' states: NJ and PA yes; VA, NC, NY, MA, CT no.
// Adjust here if a state's rules change or a book isn't live somewhere.
export const CASINO_STATES = new Set(["NJ", "PA", "MI", "WV", "DE", "RI"]);

export function offersFor(state: string | null | undefined): Offer[] {
  const st = (state || "").toUpperCase();
  return OFFERS.filter(o => o.kind === "sportsbook" || (st && CASINO_STATES.has(st)));
}

export type Stage = "not_started" | "sent" | "signed_up" | "deposited" | "done" | "skipped";
export const STAGES: { key: Stage; label: string }[] = [
  { key: "not_started", label: "Not started" },
  { key: "sent", label: "Instructions sent" },
  { key: "signed_up", label: "Signed up" },
  { key: "deposited", label: "Deposited" },
  { key: "done", label: "Promo done" },
  { key: "skipped", label: "Skip" },
];
export const STAGE_RANK: Record<Stage, number> = { not_started: 0, sent: 1, signed_up: 2, deposited: 3, done: 4, skipped: 4 };

/** The next app to work on for a client: first eligible offer that isn't done or skipped. */
export function nextOffer(state: string | null | undefined, stages: Record<string, Stage>): Offer | null {
  return offersFor(state).find(o => { const s = stages[o.key] || "not_started"; return s !== "done" && s !== "skipped"; }) || null;
}

export function buildSignupMessage(firstName: string | undefined, offers: Offer[], includeRules: boolean, includeForm: boolean) {
  const lines: string[] = [];
  lines.push(`${firstName ? `Hey ${firstName}, ` : ""}here ${offers.length === 1 ? "is the next app" : "are the next apps"} to set up.`);
  if (includeForm) lines.push("", "First, please fill out this quick form:", INTAKE_FORM);
  if (includeRules) {
    lines.push("", "Before you start:");
    SIGNUP_RULES.forEach(r => lines.push(`- ${r}`));
  }
  offers.forEach((o, i) => {
    lines.push("", `${offers.length > 1 ? `${i + 1}) ` : ""}${o.book} (${o.promo})`);
    o.steps.forEach(s => lines.push(`- ${s}`));
    lines.push(o.link);
  });
  lines.push("", "Text me once you're done or if anything comes up.");
  return lines.join("\n");
}
