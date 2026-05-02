# Hedgewise

Promo arbitrage command center. Built with Next.js, Supabase, and The Odds API.

## Features

- **Tools**: Free Bet Converter, Risk Free Bet, Profit Boost, Low Hold Finder
- **Clients**: Roster, promo tracking, action queue, 60/40 payment splits
- **Live Odds**: Pulls real-time lines from The Odds API across 8 major US books
- **Cloud Sync**: All client/promo data persists to Supabase

## Deploy to Vercel (10 minutes)

### 1. Set up Supabase database

1. Go to your Supabase project → **SQL Editor** → **New Query**
2. Paste the contents of `supabase/setup.sql`
3. Click **Run**

### 2. Push to GitHub

```bash
cd hedgewise
git init
git add .
git commit -m "Initial Hedgewise build"
git branch -M main
# Create a new repo on github.com first, then:
git remote add origin https://github.com/YOUR_USERNAME/hedgewise.git
git push -u origin main
```

### 3. Deploy on Vercel

1. Go to vercel.com → **Add New Project**
2. Import your `hedgewise` GitHub repo
3. In **Environment Variables**, add these three:

```
NEXT_PUBLIC_SUPABASE_URL=https://ueueajalybkbjbjubieo.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc... (your anon key)
ODDS_API_KEY=6ff3bfc6d9d7e54f2c66bf6010d3c5b3
```

4. Click **Deploy**
5. Live in ~90 seconds at `https://hedgewise.vercel.app` (or your custom domain)

## Run Locally

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

Open http://localhost:3000

## Project Structure

```
hedgewise/
├── app/
│   ├── api/odds/         # Server-side Odds API proxy (bypasses CORS)
│   ├── clients/          # Client management page
│   ├── tools/            # Calculators + Low Hold finder
│   ├── layout.tsx        # Top nav + shell
│   ├── page.tsx          # Home dashboard
│   └── globals.css       # All styles
├── components/
│   ├── Calculators.tsx   # Free Bet, Risk Free, Profit Boost
│   ├── LowHold.tsx       # Live odds + qualifying loss math
│   └── ui.tsx            # CheckList, Toggle, Slider, USDInput
├── lib/
│   ├── constants.ts      # Books, leagues, math helpers
│   └── supabase.ts       # Supabase client
└── supabase/
    └── setup.sql         # Database schema
```

## Roadmap

- [ ] Google Sheets sync for audit trail
- [ ] Twilio SMS integration for client messages
- [ ] Auth (Supabase Auth)
- [ ] Promo sequencing automation
- [ ] Money movement reconciliation

## Notes

- The Odds API free tier = 500 requests/month. Each Low Hold fetch uses 1 call per league.
- For production with real client data, enable Supabase Row Level Security and add auth.
