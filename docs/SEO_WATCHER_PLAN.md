# Plan: SEO Watcher (rankings "stock market", search demand, opportunity markets, USA map, coach, reports)

Status: **Phase A approved and built 2026-11-24** (branch `claude/elastic-wu-472a3e`): preview at `/growth/watcher/preview` on fictional data, math in `src/lib/watch/compute.ts` + `view.ts`, tests in `tests/watch.test.ts`. No database, no network, $0. Phase B needs its own go-ahead. Owner answers:
- **Cap: $20 a month** for Watcher data. **Only the most important clients** are watched (a per-client "Watch" switch), not all 33. When the cap or the list limits are close to full (80%), the app **asks the owner** for more room with the numbers that justify it; it never raises anything itself.
- **AI budget stays as it is.** The coach runs only when someone taps it, inside the existing budget; report wording is written by a person until the owner decides otherwise.
- **Developers** see rankings (no dollar figures) for the clients they have work on, so they can deliver to those clients. Salespeople: opportunity markets only (default, not yet confirmed).
- **Map:** all 50 states from the start; clients fill in wherever we have them.
- **Limits:** 25 keywords, 5 cities, 5 competitors per watched client.
- **Upsell rule:** as written in section 8 (3+ months, 90 days apart, happy, rankings clearly better, a specific service to offer).
- **Migration order:** 0024 Scout, 0025 Client care, 0026 sales leaderboard, **0027 SEO Watcher**.
- **Later checks:** automatic, once a week (Phase F; the scheduled route is approved in principle, built only in F).
Builds on the SEO audit (`docs/SEO_AUDIT_PLAN.md`, `docs/AUDIT_BUILDER_PLAN.md`) and sits next to Scout (`docs/SCOUT_PLAN.md`) and the Audits area (`docs/AUDITS_HUB_ADS_LEADERBOARD_PLAN.md`). Same rules as the audits: every figure has a source and a date, missing = "not found", money is a labeled model, nothing is ever sent by the app.

## What the owner asked for
1. A page that watches Google rankings for **all clients**, "almost like a stock market": trend lines, biggest movers up and down, trends the app spots, competitors on the rise.
2. **Google search volume month over month** for chosen keywords, markets (cities/states) and competitors, with lists you can add to.
3. **Reuse the data** already pulled for SEO audits.
4. **Opportunity markets:** places where it would be easy to rank, to help win new clients.
5. A **full USA map** at the bottom: animated and colorful, showing where clients are, where they rank, main competitors and opportunity spots.
6. An **SEO coach**: an AI review of each client's situation, as suggestions a person confirms.
7. **Reports:** a monthly report per client (facts + the value we brought; an upsell section at the bottom **only when it's really that client's time**), Google Business Profile checklists, and prospect reports (the existing audit). Reports are made for a person to check and send by hand.

## The idea in one picture
```
Lists you choose            Checks (DataForSEO)          Stored history            What you see
keywords · markets ──▶  rank checks (weekly or daily) ──▶  one row per keyword,  ──▶  Watcher board (index, movers, risers)
competitors              search volume (monthly)          market, date              per-client page, demand trends,
+ audit data (free)      competitor overviews (monthly)   (add-only)                opportunity markets, USA map,
                                                                                    coach suggestions, report drafts
```
All the math (movers, trends, scores, "is it upsell time") is plain, tested code. The AI only writes words from numbers the code already worked out.

---

## 1. Where it lives and who sees it

**Built (Phase A):** `/growth/watcher` (inside Growth, so the bottom bar and role checks stay as they are). A side-menu item on computers can follow once the Audits-area side-menu changes have landed.
- **Computers:** its own item in the side menu, **"SEO Watcher"**, under Growth.
- **Phones:** a big card at the top of **Growth** (the bottom bar already has 6 tabs; a 7th would be cramped).

| | Owner | Managers | Developers | Salespeople |
|---|---|---|---|---|
| Watcher board, all clients | yes | yes | **ask (see Q2)**: recommended "only the clients they have work on" | no |
| Per-client rankings, competitors, demand | yes | yes | same as above, **no dollar figures** | no |
| Edit keyword / market / competitor lists | yes | yes | no (recommended) | no |
| Opportunity markets | yes | yes | no | **ask (see Q2)**: recommended yes, they contain no client details |
| USA map | yes | yes | no | opportunity layer only, if they see opportunities |
| SEO coach suggestions | yes | yes | no | no |
| Monthly reports, GBP checklists, upsell section | yes | yes | no | no |
| Cost and spending caps | yes | see only | no | no |

**Money and billing never leak:**
- The Watcher never reads billing tables, `clients.monthly_usd`, or anything owner-only. A guardrail test pins this (Watcher files may not import billing code).
- The only dollar figures are "traffic value" (a DataForSEO estimate, labeled) and the audit-style "what rankings could be worth" model. Both are hidden from developers.
- The database decides who sees which rows (RLS); hiding a button is never the lock.

## 2. The screens

### Watcher board (`/watcher`)
- **Agency index:** one line chart, "all clients' Google visibility", set to 100 on the first check. Visibility = for each tracked keyword, monthly searches × the share of clicks that position usually gets (a published-average click curve, labeled "model"). Ranges: 4 weeks · 3 months · 12 months.
- **Client tickers:** one row per client, like a stock list: visibility now, change (▲ green / ▼ red), small sparkline, # keywords in the top 3 / Maps top 3.
- **Biggest movers:** the top 5 keywords up and top 5 down across all clients this period, weighted by search volume (moving from 14 → 4 on a 900-search keyword ranks above 50 → 30 on a 20-search one).
- **Trends we spotted (inferred):** short, labeled lines from simple rules, e.g. "Rising 5 weeks in a row", "Dropped out of the Maps top 3 in 2 markets", "Searches for *water heater repair* up 40% vs last year". Each says "inferred from N checks" and needs a minimum number of data points so one noisy day can't trigger it.
- **Competitors on the rise:** domains that gained the most visibility on our clients' keywords, with which clients they're crowding.
- **The map** (section 6) sits at the bottom.

### Per client (`/watcher/[client]`)
- Their visibility line, keyword table (position now / last check / 4 weeks ago / best, organic and Maps, with arrows), markets, competitors side by side, demand trend for their keywords, coach suggestions, report drafts.
- **Lists** (owner/managers): add or remove keywords (mark "money keywords"), markets (city + state), competitors (website). Limits per client so costs stay predictable (defaults: 25 keywords, 5 markets, 5 competitors; owner can change).
- **Import from audit:** pick a saved audit with results; its keywords, markets (with map positions), competitors and positions become this client's **first data point**, dated with the audit's real retrieval date. Free, no new data pulled.

### Search demand (`/watcher/demand`)
- Monthly Google searches for each keyword × market, month over month and same month last year, with seasonality (which months are busy). Includes keywords on "watch" that no client has yet (for prospecting).

### Opportunity markets (`/watcher/opportunities`)
See section 5.

## 3. Data sources and costs

**Provider: DataForSEO** (already connected in Claude Code; pay as you go, no monthly fee, $50 minimum top-up). Prices checked 2026-11-24 on dataforseo.com; the app will show its own estimate before every run and the first test run confirms the real numbers.

| What | DataForSEO product | Price (standard queue) |
|---|---|---|
| Organic rank for one keyword in one city | Google Organic SERP | $0.0006 per 10 results; we'd check the top 30 = **$0.0018** |
| Maps / local pack rank, same keyword and city | Google Maps SERP | **$0.0006** per check |
| Monthly search volume | Google Ads search volume (Keywords Data) | **~$0.06 per task**, one task covers hundreds of keywords for one location |
| Competitor overview, keyword difficulty | DataForSEO Labs | ~$0.012 per request + $0.00012 per row |

So **one rank check** (one keyword, one city, organic + Maps) ≈ **$0.0024**. Competitors cost nothing extra on rank checks: the same results show who else ranks.

**Example: 33 clients × 20 keywords × 3 markets = 1,980 checks per round**

| Cadence | Rank checks / month | + volume, competitors, opportunities | **≈ Total / month** |
|---|---|---|---|
| Monthly | ~$5 | ~$15 | **~$20** |
| **Weekly (recommended start)** | ~$20 | ~$15 | **~$35** |
| Weekly for all + **daily for 5 money keywords** per client | ~$55 | ~$15 | **~$70** |
| Daily for everything | ~$143 | ~$15 | **~$160** |

The "+ ~$15" is: search volume monthly for ~100 client markets + ~50 watched markets (~$9), competitor overviews (~$3), one opportunity sweep of ~50 markets (~$3–5).

**Owner's choice: $20/month cap, important clients only.** At ~$0.0024 a check, 12 watched clients × 20 keywords × 3 cities weekly ≈ $7.50/month, plus ~$5–8 for search volumes and competitors, which fits. The original recommendation was: weekly checks for everything, search volume monthly, cap $50/month. Why: Google rankings jump around day to day for small local businesses; a weekly line is easier to read and cheaper, and still shows trends within a month. Daily for a few money keywords can be switched on later if the weekly view feels too slow. Search volume only changes once a month at Google, so checking it more often buys nothing.

**AI (coach + report wording):** about 6–8 cents per client review with Claude Opus 5.5 (≈ 8,000 words in, ≈ 1,500 out). 33 clients once a month ≈ **$2.50**, the report wording about the same. That comes out of the existing AI budget, which would need to go up if it's still $10/month (see Q1).

**Spending caps** follow the audit/Scout design: an add-only ledger, a monthly cap the database enforces, the cost written down before any paid call; over the cap = the call never happens.

### How the data gets in (same path as audits and Scout)
1. **First (no new network code):** "Copy Watcher prompt" builds a prompt with the lists; it's run in Claude Code where DataForSEO is connected, and the results file is attached in Atlas, checked field by field (source + date on every figure, size limits, plain text only).
2. **Later (Phase F):** the app pulls data itself. This needs the **same exception** the audit builder (Phase E) and Scout (S3) already ask for: **one** shared DataForSEO module that sends POST requests only to an allowlist of DataForSEO *read* endpoints (their reads use POST). Building it once serves all three.
3. **Weekly/daily on a schedule** needs one more exception: a scheduled job (Vercel Cron, included in Vercel Pro) calling a new, token-checked route. Today the only API route is the owner summary, so this is a rule change for you to approve. The alternative without a new route: checks start when someone opens the Watcher and the last round is older than a week (like the client-care "refresh on open"), which is free of new routes but skips weeks nobody opens it.

GoHighLevel isn't involved and stays read-only.

## 4. Stored data (new migration)

**Number: `0027_seo_watcher.sql`** (owner's order: 0024 Scout, 0025 Client care, 0026 sales leaderboard). `watch_clients` (which clients are watched) is added to the list below.

| Table | What it holds | Who writes |
|---|---|---|
| `watch_keywords` | client (or none = market watch), keyword, group, money keyword?, active | owner/managers |
| `watch_markets` | client (or none), city, state, latitude/longitude, DataForSEO location code, kind: client market / opportunity watch, niche list | owner/managers |
| `watch_competitors` | client, competitor website, how found (manual / from results / from audit), active | owner/managers |
| `watch_runs` | what was checked, who started it, estimated and actual cost, source, when | owner/managers |
| `watch_rank_checks` | **add-only**: keyword, market, date, organic position (null = not in top 30), Maps position (0 = checked, not in top 3; null = not checked), page that ranks, top domains seen, source, retrieved | via attached results, later the adapter |
| `watch_volumes` | keyword × location × month: searches, cost per click, source, retrieved. **No client column**, so it's shared and never repeats a paid lookup | same |
| `watch_spend`, `watch_limits` | add-only cost ledger, monthly cap (database-enforced), per-client list limits | owner sets caps |
| `watch_reports` | client, kind (monthly / GBP checklist), month, frozen facts, upsell included? + reason, status draft → reviewed → **"marked sent by [person]"** (a person sent it themselves) | owner/managers |
| `watch_coach_notes` | client, suggestions (each cites the facts it used), each one new / added as work order / dismissed, link to `ai_usage` | owner/managers tap |

- **Every table:** RLS, the restrictive two-factor (`aal2`) rule, minimum grants, **break-in tests** in `supabase/tests/10_rls_break_in.sql`:
  - salespeople and developers can't read client rankings, reports or coach notes (except developers' own clients, if Q2 = yes);
  - salespeople can read opportunity markets and shared search volumes only, never a row with a client on it;
  - nobody can edit or delete rank checks or the spend ledger;
  - the spend cap can't be passed, even by calling the database directly;
  - the existing "salesperson / developer sees nothing else" tests are extended, not weakened.
- **The app works before the migration is run:** screens show "needs 00NN" and the sample preview still works.
- Only business facts are stored: websites, cities, keywords, positions. No people's names, phones or emails (database check, like Scout).

## 5. Opportunity markets: "where would it be easy to rank?"

For a **niche × city** (e.g. "roofer × a town 40 minutes away"), the app scores 0–100 with plain reasons:
- **Demand:** monthly searches for the niche's main keywords there (and the trend).
- **Weak competition:** the businesses in the Maps top 3 have few reviews, slow or missing websites, low link strength, and keyword difficulty is low.
- **Fit for us:** near our home base or near existing clients (proof we can show), and not a market where a current client would be competing with a new one (**conflict check:** never suggest pitching a client's direct competitor in that client's own market).

Example line: **82** "1,900 searches/month for roofing terms · Maps top 3 average 23 reviews · 2 of 3 have no real website · 25 mi from the office · no client of ours in this niche here".

Weights live in `WATCH_RULES` (tunable, tested), like the sales coach and Scout. Buttons: **"Scout this market"** (opens a Scout run filled in) and **"Start an audit"** for a business found there. Opportunity scores are guesses; the screen always shows the evidence.

## 6. The USA map

- **Whole USA** with every state outline, drawn by the app as an SVG (no map package, no map service, nothing sent anywhere). Extends `src/lib/audit/geo.ts`: the Ohio-only list becomes all 50 states + DC, simplified from the free **US Census** boundary files (public domain), with Alaska and Hawaii as small insets. Our own small projection function, tested, like today's Ohio math.
- **Layers** (tap to turn on/off):
  - **Clients:** a glowing dot per client market, colored by rank health (green = top 3, amber = 4–10, red = below 10), sized by search demand.
  - **Competitors:** small markers for the main competitor in each market, tinted when they're rising.
  - **Opportunities:** soft pulsing halos, brighter = higher score.
  - **States** shaded by how many clients/markets we have there.
- **Animation:** dots fade in state by state, halos pulse, a **"Replay"** slider plays the last 12 weeks of rank colors. With *reduce motion* switched on in the phone/computer settings, everything is still and the slider steps instead of playing.
- Tap a state to zoom into it (the existing state map), tap a dot for the client or opportunity card.
- **One-time step for you to OK:** downloading the Census outline file (~1–3 MB, from census.gov) once on this Mac to make the simplified outlines; only the small simplified result (~40–80 KB) goes into the app.
- Pins are at **city level**, never street addresses.

## 7. SEO coach (AI suggestions)

- Per client, on a button ("Review this client") or with the monthly report: the AI gets **only the computed facts** (rank changes, demand, competitors' movement, GBP checklist gaps, open work) with the client and competitor names **swapped for codes** (`src/lib/ai/snapshot.ts`).
- Goes through `src/lib/ai/client.ts` only: no tools, worst-case cost checked against the monthly budget first, logged to `ai_usage`.
- Returns 3–6 short suggestions, each citing the facts it used ("Maps rank fell 2 → 6 in Market B while COMP2 added 40 reviews") and a type (on-page, Google Business Profile, reviews, links, new page, new market).
- Each suggestion: **Add as work order** (a person taps; assign picker as in Smart add) or **Dismiss**. Nothing happens on its own.

## 8. Reports (made for a person to review and send)

### Monthly client report
- Same 1280×720 style as the audit deck, print to PDF. Pages:
  1. **This month in one look:** visibility index, keywords in the top 3, biggest wins.
  2. **Rankings table** with arrows, organic and Maps.
  3. **Map** of their markets.
  4. **Competitors** side by side.
  5. **Search demand** for their services (season, trend).
  6. **What we did:** completed work-order titles for the month (a person reviews the wording; internal notes are never pulled in).
  7. **Next month's plan.**
  8. *Only when it's their time:* **"Your next step to grow"** (see below).
- **Value shown:** estimated visits from rankings (model, labeled), DataForSEO traffic value (estimate, labeled), and job value only when the client has given us real numbers.
- The facts are frozen when the draft is made, so the report doesn't change after it's sent. Status: draft → reviewed → "marked sent" by a person. **The app never sends it.**

### When is it "their time" for an upsell? (`upsellDue`, pure and tested)
The section appears only when **all** of these are true:
1. **They've been with us at least 3 months.**
2. **No upsell in the last 90 days** (counted from reports marked sent with an upsell).
3. **They're happy:** health not "at risk", no open blocker or complaint, last check-in mood not negative.
4. **We've earned it**, at least one of:
   - 3+ money keywords moved into the top 3 in the last 60 days;
   - their visibility is up 20%+ over 3 months;
   - they hold the top 3 on 60%+ of their keywords in their markets ("ceiling": the next growth has to come from somewhere new).
5. **There's a specific next step:** a service they don't have (from their service list), or a nearby opportunity market in their niche.

Then it shows **one** idea, with the reason. Owner/manager can switch it off (or on) per report. Numbers live in `UPSELL_RULES`. No billing data is used.

### Google Business Profile checklist
- Per client (and usable for prospects): primary/secondary categories, services listed, hours, photo count vs the Maps top 3, review count and rating vs top 3, how fast competitors gain reviews, replies to reviews, recent posts, description, website link, name/address consistency.
- Filled from public listing data where DataForSEO has it (a few cents per client); the rest are tick boxes a person checks. We never log into anyone's Google Business Profile.

### Prospect reports
- These are the existing SEO (and coming Google Ads) audits. The Watcher just links to them ("Start an audit" from an opportunity).

## 9. Before real data exists
- **Fictional sample only:** `src/fixtures/watch-sample.ts` with 6 made-up businesses ("Sample Plumbing Co (fictional)" etc.) in real US cities, 6 months of generated weekly rank checks and search volumes, made-up competitor domains (`*.example`).
- With the database on, `showsSamples()` is false, so the real Watcher shows an empty state ("Add keywords or import an audit"), plus a **"Preview with sample data"** link to `/watcher/preview` with a big "Sample (fictional)" banner, like the audit preview. Sample records are never mixed with or attached to real clients.

## 10. Files
- **New, pure and tested:** `src/lib/watch/compute.ts` (built: `visibilitySeries`, `movers`, `trendOf`, `competitorRisers`, `volumeChange`, `seasonality`, `spotTrends`, `opportunityScore`, `upsellDue`, `upsellFacts`, `roomNotice`, `WATCH_RULES`, `OPPORTUNITY_RULES`, `UPSELL_RULES`; later: `gbpChecklist`, `fromAudit`), `src/lib/watch/view.ts` (built: what each screen shows), `src/lib/watch/intake.ts` (strict results checker), `src/lib/watch/usa.ts` (outlines + projection), `src/fixtures/watch-sample.ts`, `docs/WATCHER_PROMPT.md`, `tests/watch.test.ts`.
- **New screens:** `src/app/(app)/growth/watcher/` (home, `preview` board, `preview/[client]`, `preview/demand`, `preview/opportunities`; later the real versions and `reports/[id]`), `src/components/watcher/` (hand-written SVG charts and map, no chart package).
- **Changed:** `src/app/actions.ts` (list edits, attach results, make report, mark reviewed/sent, coach accept/dismiss; each starts with `notWhilePreviewing()`), `src/lib/data-source.ts`, `src/components/shell/SideNav.tsx`, Growth page card, `src/lib/roles.ts` (a `canSeeWatcher` helper), `tests/guardrails.test.ts`, `supabase/tests/10_rls_break_in.sql`, `CLAUDE.md`.
- **Not touched:** `src/lib/ghl/`, billing, the audit tables (import reads saved audits; it doesn't change them).

## 11. Phases (each one checked and approved before the next)
- **A. Screens on sample data.** Compute module + tests, board, client page, demand, opportunities (list), preview banner. **No database, no network, $0.**
- **B. Real lists + stored history.** Migration, list editing, import from audits, Watcher prompt + attach results. **$0 in the app**; a first real round run from Claude Code costs a few dollars.
- **C. USA map.** All-state outlines, layers, animation, reduced-motion. $0 (one Census download, with your OK).
- **D. Reports.** Monthly report + upsell rule + GBP checklist. $0 (wording by hand until E).
- **E. SEO coach + report wording (AI).** ~$5/month at 33 clients.
- **F. The app pulls data itself, on a schedule.** Shared DataForSEO module (POST read-only exception) + schedule (cron route exception or "refresh on open"). This is where the monthly cost starts running on its own, inside the cap.

Order can change, e.g. F before C/D if a live "stock market" matters more than the map.

## 12. Risks and things to review
- **Rankings are noisy and location-dependent.** A check from "Akron" isn't what every phone in Akron sees. Every number says where and when it was checked; trends need several points.
- **"Easy to rank" and "rising competitor" are inferences**, always labeled and shown with their evidence. Don't promise a prospect results from a score.
- **Upsell rules can be wrong;** a person always decides, and the switch per report stays.
- **Competitor data is public business info** about real companies (websites, rankings, review counts). Kept minimal, no people's details. **Flagged for your privacy review**, per the project rules.
- **Costs grow with lists.** Per-client limits + the database-enforced monthly cap stop surprises; the board shows "spent $X of $Y this month".
- **Attached results and AI answers are untrusted:** checked field by field, shown as plain text, never treated as instructions.
- **Overlaps:** Scout, Audits area and client care touch Sales, `actions.ts`, `data-source.ts`, the side menu and the break-in tests. Built on its own branch after those land, to avoid editing the same files at once.

## Done means (Phase A)
- `/watcher/preview` shows the board, a client page, demand and opportunities with fictional data, banner on, on phone and computer, light and dark.
- Movers, trends, opportunity scores and the upsell rule are unit-tested, including edge cases (no data, one data point, "not in top 30", a client with no markets).
- Developers and salespeople see the role notice; nothing real is shown.
- `npm run check` passes.

## Questions for the owner (answered 2026-11-24, see Status at the top; Q8 left as A → F)
1. **Cadence and budget:** start **weekly for everything (~$35/month, cap $50)**? Or monthly (~$20), or weekly + daily on 5 money keywords (~$70)? And raise the AI budget by ~$5/month for the coach + report wording?
2. **Who sees it:** developers see rankings (no dollars) for **only the clients they have work on**? Salespeople see **opportunity markets only**?
3. **Map scope:** all 50 states from the start (recommended, ~40–80 KB), or Ohio + neighbors first? OK to download the free Census outline file once?
4. **List sizes per client:** 25 keywords, 5 markets, 5 competitors OK as defaults?
5. **Upsell rule:** are 3 months in / 90 days between / the "earned it" signals above right for your clients?
6. **Migration number clash:** Scout and client care both claim `0024`. Which keeps it? The Watcher takes the next free number after both and the Audits area.
7. **Scheduled checks (Phase F):** OK in principle to add one token-checked scheduled route, or prefer "refresh when someone opens it"?
8. **Phase order:** A → B → C → D → E → F, or bring F (automatic data) earlier?
