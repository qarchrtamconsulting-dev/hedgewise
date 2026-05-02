import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sport = searchParams.get("sport");
  const bookmakers = searchParams.get("bookmakers");

  if (!sport) return NextResponse.json({ error: "Missing sport" }, { status: 400 });

  const url = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${process.env.ODDS_API_KEY}&regions=us&markets=h2h&oddsFormat=decimal${bookmakers ? `&bookmakers=${bookmakers}` : ""}`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    const remaining = res.headers.get("x-requests-remaining");
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `API ${res.status}: ${text}`, remaining }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json({ data, remaining });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
