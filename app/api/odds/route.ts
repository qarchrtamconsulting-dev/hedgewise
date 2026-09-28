import { NextRequest, NextResponse } from "next/server";

// Simple in-memory cache (60 second TTL) — protects your API quota from rapid refetches
const cache = new Map<string, { data: any; timestamp: number; remaining: string | null }>();
const TTL_MS = 60 * 1000;

// Featured markets come in one call per sport; alternate lines only come one game at a time.
const FEATURED = new Set(["h2h", "spreads", "totals"]);
const ADDITIONAL = new Set(["alternate_spreads", "alternate_totals"]);
const SAFE = /^[a-z0-9_]+$/i;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sport = searchParams.get("sport");
  const bookmakers = searchParams.get("bookmakers");
  const event = searchParams.get("event");
  const list = searchParams.get("list") === "1";
  const markets = (searchParams.get("markets") || "h2h").split(",").map(s => s.trim()).filter(Boolean);

  if (!sport || !SAFE.test(sport)) return NextResponse.json({ error: "Missing sport" }, { status: 400 });
  if (event && !SAFE.test(event)) return NextResponse.json({ error: "Bad event" }, { status: 400 });
  if (bookmakers && !/^[a-z0-9_,]+$/i.test(bookmakers)) return NextResponse.json({ error: "Bad bookmakers" }, { status: 400 });
  const allowed = event ? (m: string) => FEATURED.has(m) || ADDITIONAL.has(m) : (m: string) => FEATURED.has(m);
  if (!list && (!markets.length || !markets.every(allowed))) {
    return NextResponse.json({ error: `Markets not allowed here: ${markets.join(",")}` }, { status: 400 });
  }

  const key = process.env.ODDS_API_KEY;
  const books = bookmakers ? `&bookmakers=${bookmakers}` : "";
  const common = `apiKey=${key}&regions=us&oddsFormat=decimal&includeLinks=true&includeSids=true${books}`;
  const url = list
    // The events list doesn't use quota: used when only alternate lines are wanted.
    ? `https://api.the-odds-api.com/v4/sports/${sport}/events?apiKey=${key}&dateFormat=iso`
    : event
      ? `https://api.the-odds-api.com/v4/sports/${sport}/events/${event}/odds?${common}&markets=${markets.join(",")}`
      : `https://api.the-odds-api.com/v4/sports/${sport}/odds/?${common}&markets=${markets.join(",")}`;

  const cacheKey = `${sport}|${bookmakers || ""}|${list ? "list" : markets.join(",")}|${event || ""}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < TTL_MS) {
    return NextResponse.json({ data: cached.data, remaining: cached.remaining, cached: true });
  }

  try {
    const res = await fetch(url, { cache: "no-store" });
    const remaining = res.headers.get("x-requests-remaining");
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `API ${res.status}: ${text}`, remaining }, { status: res.status });
    }
    const data = await res.json();
    cache.set(cacheKey, { data, timestamp: Date.now(), remaining });
    return NextResponse.json({ data, remaining, cached: false });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
