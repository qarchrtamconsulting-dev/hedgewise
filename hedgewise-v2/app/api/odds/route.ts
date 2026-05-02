import { NextRequest, NextResponse } from "next/server";

// Simple in-memory cache (60 second TTL) — protects your API quota from rapid refetches
const cache = new Map<string, { data: any; timestamp: number; remaining: string | null }>();
const TTL_MS = 60 * 1000;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sport = searchParams.get("sport");
  const bookmakers = searchParams.get("bookmakers");

  if (!sport) return NextResponse.json({ error: "Missing sport" }, { status: 400 });

  const cacheKey = `${sport}|${bookmakers || ""}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < TTL_MS) {
    return NextResponse.json({ data: cached.data, remaining: cached.remaining, cached: true });
  }

  const url = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${process.env.ODDS_API_KEY}&regions=us&markets=h2h&oddsFormat=decimal&includeLinks=true&includeSids=true${bookmakers ? `&bookmakers=${bookmakers}` : ""}`;

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
