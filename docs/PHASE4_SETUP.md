# Phase 4 setup: connect the AI (with a $10/month cap)

About 10 minutes. You do these steps yourself. Claude never sees the key.

## 1. Anthropic account + the provider's own spend limit

1. Go to **console.anthropic.com** and create an account (or sign in).
2. **Billing**: add a payment method and buy **$10 of credit**.
3. **Limits** (under Settings): set the **monthly spend limit to $10**.
   This is the second lock: even if the app had a bug, Anthropic stops at $10.
4. **API keys** → **Create key**. Name it `Agency Atlas`. Copy it (starts with `sk-ant-`).
   Treat it like a password: never paste it in chat, email or screenshots.

## 2. Add the key to this Mac

```bash
cd ~/Desktop/"Agency AI" && open -e .env.local
```

Add one line under the others, save with Cmd+S:

```
ANTHROPIC_API_KEY=sk-ant-...
```

## 3. Create the AI tables in Supabase

**SQL Editor** → **New query** → paste everything from
`supabase/migrations/0005_ai_budget_and_results.sql` → **Run**.

(Also run `0003` and `0004` first if you haven't yet.)

## 4. Tell Claude "done"

Claude rebuilds the app. Then:

- **Home** → **Get today's briefing** (takes up to a minute).
- A client page → **Draft a profile with AI**.
- **Data Safety** → **AI spend** shows every request's cost and the budget bar.
  The owner can change the monthly budget there ($10 by default).

## How the budget works

- Amber at 50%, red banner on Home at 80%.
- At 100% the app stops sending AI requests until the 1st of next month.
- Before each request, the app checks that the request's worst-case cost still fits.
- Expected use: a daily briefing costs roughly $0.10–$0.25; a client profile a few cents.

## Cut it off any time

Delete the key in the Anthropic Console (API keys). The AI stops immediately.
