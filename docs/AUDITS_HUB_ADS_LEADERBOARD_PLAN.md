# Plan: Audits area (SEO + Google Ads), Google Ads audit, sales leaderboard

Status: **owner answers in (2026-11-24). Phase 1 (Audits area) built and merged. Phase 2 (leaderboard, `0026`) built and merged. Phase 3 (Google Ads audit, `0029` written, not run) built on branch `ads-audit`. Phase 4 not started.**
Owner answers: Audits = its own side-menu item on computers + a big card at the top of Sales on phones (no new phone tab) · leaderboard = Won deal value **this month** · Ads math = **1 in 10 clicks becomes a lead**, then a close rate · order = Audits area → leaderboard → Google Ads audit. Builds on `docs/AUDIT_BUILDER_PLAN.md` (Phase A built, `0023` run) and replaces its "Phase D". Overlaps the Scout plan (`docs/SCOUT_PLAN.md`, another session) only in the Sales area; build after or alongside it on a separate branch.

## What the owner asked for
1. **Audits as its own area** with two clear doors, **SEO audit** and **Google Ads audit**, each with its own list and its own "New". No more picking "Google Ads" inside the SEO builder.
2. **Start the Google Ads audit:** like the SEO audit, show the money the business is leaving on the table: how many clicks the market has, what a click costs, and "if 1 in 10 clicks becomes a lead, here's what that's worth".
3. **A small, fun sales leaderboard** at the top right of Sales: every salesperson with an icon and their total, e.g. founder $43,256, the other reps $0. New reps appear on it automatically. Later: a KPI threshold everyone must meet.

## 1. Audits area
- **Where:** a new **Audits** page reached from Sales (card at the top) and, on computers, its own item in the side menu under Sales. Salespeople, owner and managers see it; developers don't (same as today).
- **Audits home** (`/audits`): two big cards side by side on a computer, stacked on a phone:
  - **SEO audit**: "Where they rank, who beats them, what it's worth." Count of saved SEO audits + **New SEO audit**.
  - **Google Ads audit**: "What clicks cost, what they'd bring in." Count + **New Ads audit**.
  - Below: **Recent audits** (both kinds, labeled).
- **Each kind** gets its own list and builder: `/audits/seo`, `/audits/seo/new`, `/audits/ads`, `/audits/ads/new`, and the saved audit at `/audits/[id]`. Old `/sales/audits/...` links redirect, so nothing saved is lost.
- The SEO builder loses the "SEO / Google Ads" choice (still 4 steps). The lead page button is now "SEO audit for this lead"; it asks "SEO or Google Ads?" once the Ads builder exists (Phase 3).
- Built: `/audits` (two doors, recent audits, spending, template, owner settings), `/audits/seo`, `/audits/seo/new`, `/audits/ads` ("coming soon": what it will show), `/audits/[id]`, `/audits/[id]/edit`; side-menu "Audits" under Sales; phone card at the top of Sales (`AuditDoors`); old `/sales/audits…` links redirect (`next.config.ts`).
- **Database:** none for this part. `audits.kind` already allows `'seo'` and `'ads'` (`0023`).

## 2. Google Ads audit (prospects first)
Same rules as the SEO audit: every figure has a source and date, missing = "not found", money is a **labeled model** with its inputs shown, rates are "assumption" until the client confirms. Data is pulled the same way as SEO today (copy the custom prompt into Claude Code, where DataForSEO is connected); the app itself fetches nothing yet.

**Builder (phone: one step per screen; computer: form left, live summary right):**
1. **The business:** website, name, niche, town + state, other cities, services, up to 5 competitors (optional).
2. **Money inputs** (all "assumption" until confirmed): average job $, **clicks that become leads (default 10%, as asked)**, leads that become jobs (default 30%), monthly ad budgets to compare (default $1,500 / $3,000 / $5,000).
3. **What to include** (checkpoints, presets "Quick look" and "Full"):

| Checkpoint | What it shows | Data |
|---|---|---|
| Market size *(always on)* | Searches a month for their services in their area, how many clicks are up for grabs | Google Ads search volume (DataForSEO) |
| Cost per click | Low / typical / high price per click for each money keyword; cheapest wins | Google Ads keyword data (DataForSEO: CPC, top-of-page bid range, competition) |
| Budget → results calculator *(the headline page)* | For each budget: clicks ÷ CPC → leads (× 10%) → jobs (× close rate) → **revenue and return per $1 spent** | Our own math (`src/lib/audit/ads-compute.ts`, pure, tested) |
| Who's bidding | Which competitors show ads on their key searches, their ad text, how often | Live Google results with ads (DataForSEO); Semrush paid-search optional |
| Competitor ad spend | Estimated monthly paid clicks and spend per competitor | DataForSEO Labs / Semrush estimates, labeled "estimate" |
| Are they running ads now? | Seen in ads: yes/no, where, which page the ad opens | Same live results |
| Landing page check | Does the ad page load fast on phones, have a call button and a form | Google Lighthouse (DataForSEO) |
| Local Services Ads *(suggested)* | Whether the "Google Guaranteed" spots show for their trade | Live results |
| Plan + investment | Ad budget + our management fee, ramp timeline (month 1 learning, 2–3 tuning, 4+ scaling) | Owner's settings only (no made-up prices) |

4. **Data + cost:** estimate and caps, same as SEO (DataForSEO keyword data is cents per audit; the same per-audit/weekly/monthly caps apply).

**Deck:** 5–7 pages at 1280×720 in the same style as the SEO deck, only chosen pages, printable to PDF.

**Owner settings for Ads** (Audits → Settings): management fee plans (up to 4, like SEO plans), default budgets, default rates. Prices only come from here.

**Existing clients' real Google Ads accounts** (read-only, through Google's API) are a later step with its own approval: it needs a Google Ads developer token and read-only access, and the same "never write" rule as GoHighLevel.

**Database (`0029` or later; `0027` is SEO Watcher):** probably none for the audit itself (`audits` already stores intake/config/data as JSON); `audit_settings` gains an `ads_plans` column. Break-in tests added for it.

## 3. Sales leaderboard
**What it shows:** a slim card at the top right of the Sales tab (on a phone: a row of small chips under the title). Each salesperson: initials icon, first name, total, rank. Gold/silver/bronze for the top 3 who won something, everyone else after; people with the same total share a rank. (An owner on/off switch was left out for now; ask if wanted.)

**Built:** `0026_sales_leaderboard.sql` (one read-only view: name, linked, is_me, won_usd, won_deals; owner/managers/sales with two-factor; break-in tests 7w), `src/lib/leaderboard.ts` (rank, medals, labels; `tests/leaderboard.test.ts`), `getLeaderboard` in `data-source.ts`, `src/components/sales/SalesLeaderboard.tsx`. Before `0026` is run the card is hidden (the owner sees "needs 0026").

**Where the number comes from (never typed in, never made up):** the **value of deals marked Won in GoHighLevel**, credited to the salesperson the deal is assigned to in GoHighLevel, for **this month**, New York time (resets on the 1st). Once sales pipelines are picked, only those count; before that, every pipeline counts. Label on the card: "Won deal value · GoHighLevel · this month". People with no linked GoHighLevel user show "not linked" instead of $0, so nobody looks worse than they are.

**Who sees what (needs a small database step):** today a salesperson can only see *open* leads, not won deals. The leaderboard needs a tiny summary the database builds for them: **name + total + rank only**, never which deals or which clients. Planned as a read-only summary in `0026` with break-in tests (salesperson can see totals, can't see the deals behind them; developers see nothing).

**The founder appears on it** if the founder is set up as a salesperson (linked to a GoHighLevel user in Sales → Setup). Names come from the team list in the database, never written into the code.

**Later: KPI threshold.** The owner sets a monthly target (deal value and/or reach-outs); the leaderboard shows a line and who's above/below. Before it's used to decide anyone's job, check that GoHighLevel assignment is accurate for everyone (a deal assigned to the wrong person would make a rep look worse), and give a fair ramp period for new reps. Flagged for the owner's human review.

## Phases (each checked before the next)
- **Phase 1: Audits area.** New pages, two doors, SEO builder without the type step, redirects. No database. Small.
- **Phase 2: Sales leaderboard.** `0026` summary + break-in tests (order set by the owner: `0024` Scout, `0025` client care), card on Sales. You run `0026`.
- **Phase 3: Google Ads audit, builder + deck with "not pulled yet" figures + custom Ads prompt.** Plus `ads_plans` in settings. Costs $0; fetches nothing.
- **Phase 4: first real Ads audit.** Run the prompt in Claude Code on a real prospect (a few cents of DataForSEO), attach results (shares Phase B of the audit builder).
- **Later:** KPI threshold; real client Google Ads accounts (read-only, separate approval); the app pulling data itself (audit Phase E).

## Risks and privacy
- Leaderboard: shows each rep's sales total to the other reps. That's the point, but it's pay-adjacent information; only totals, never deal or client details.
- Ads audit holds business facts about prospects (same as SEO; no emails or phone numbers).
- Ad spend for competitors is an **estimate** from third-party data and is labeled that way; never shown as fact.
- No writes to GoHighLevel or Google Ads, ever.

## Done means
- Phase 1: from Sales or the side menu, Audits shows two doors; each has its own list and builder; old links still work; phone and computer clean; `npm run check` passes.
- Phase 2: every salesperson shows on the leaderboard with their GoHighLevel won value for the period; a salesperson can't read the deals behind others' totals (break-in tests); `npm run test:rls` passes.
- Phase 3: a rep builds and saves an Ads audit, copies the Ads prompt, opens a deck with only the chosen pages and the budget calculator working from the inputs.

## Phase 3 as built (2026-11-24)
- `0029_ads_audits.sql`: `audits.sections` checked by kind (SEO keeps its 13 ids; Ads gets 9 `ads_` ids; no mixing), `audit_settings.ads_plans` (≤4, owner edits). Break-in tests 7x.
- `src/lib/audit/ads.ts`: checkpoints + presets, `parseAdsIntake` (reuses the SEO intake check for the shared fields; adds click→lead 1–50% default 10%, lead→job 5–100% default 30%, 1–3 budgets $100–$100,000), `parseAdsPlans`, `AdsData` (every figure a `Fig`), `emptyAdsData`, `adsMarket` (search-weighted middle of the bid range), `budgetRows` (budget ÷ CPC → clicks → leads → jobs → revenue, per $1, cost per lead, "more than the market" flag).
- `src/lib/audit/ads-prompt.ts`: copy-only Ads prompt (read-only, never touches a Google Ads account; competitor spend labeled estimate; prices only from settings).
- Pages (`src/components/audit/ads/AdsDeck.tsx`): Market size (cover), Cost per click, Budget calculator, Who's bidding (+ spend), Their ads today (running / landing / LSA), Plan + investment. Fictional sample at `/audit/sample-ads` (`src/fixtures/ads-sample.ts`).
- Screens: `/audits/ads` (list + template), `/audits/ads/new` (`AdsBuilder`), `/audits/[id]` and `/edit` branch by kind (`AdsAuditView`), Ads prices in Audits → Settings (`AdsPlansForm`, owner), "Google Ads audit for this lead" on the lead page. `saveAdsAudit`, `saveAdsPlans` in `actions.ts`. Before `0029`: Ads saving says "needs 0029"; everything else works.
- Not yet: attaching results (shared with audit Phase B), real client Google Ads accounts (separate approval).
