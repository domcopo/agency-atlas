# Plan: run audits inside Atlas ("Run audit", for reps on the road)

Status: **E1 approved and built 2026-11-25** on branch `audit-results` (with Attach results B1). `0035` written, not run. Needs the DataForSEO login in Vercel before it can run. Owner answers (2026-11-25): the **app pulls the data and the AI only writes the words**; **owner, managers and salespeople** can run (within the caps); sources **DataForSEO, LeadSnap and sometimes Semrush**, with room for more add-ons later. This is "Phase E" of `docs/AUDIT_BUILDER_PLAN.md`; it builds on Attach results (`docs/AUDIT_RESULTS_PLAN.md`, B1), which stays as the backup (copy the prompt, paste the reply).

## How it works for a rep (phone or computer)
1. Build and save the audit (as today), SEO or Google Ads.
2. On the saved audit: **Run audit**. Atlas shows the cost first: "About $0.80 (worst case $1.40). You have $8.60 of $10 left this week. Sources: DataForSEO, LeadSnap." → **Run**.
3. Atlas works in the background; the page shows the steps ("Searches per city ✓ · Who ranks… · Reviews…"). The rep can lock the phone; the audit is ready when they come back (about 1–3 minutes).
4. The pages fill in. The rep spot-checks, then shares or saves the PDF.
5. Running again later **refreshes** it (the same cost check). With results from the last 30 days, Atlas offers "use these (free)" first (this is the B2 "reuse" step, done here).

## What happens inside (why it's reliable)
- **Numbers come straight from the data services**, through one small server-only module per source (`src/lib/audit/sources/`). Each module calls only an allowlisted list of **read-only lookups**, with the login kept in Vercel's secret settings, never in code, never in the browser.
- Each source fills its part of the same **`ATLAS-RESULTS v1` block** the copy-paste route uses, so everything goes through **the same strict checker** (source + date on every figure, ranges, right website…) before it's saved.
- **Atlas does the math** (existing formulas, unchanged).
- **Claude writes only the words** (headline, page notes, top fixes) from the finished numbers, through the existing AI helper (`src/lib/ai/client.ts`): **no tools**, can't look anything up, answers in a fixed shape. Business names are swapped for codes ("BUSINESS", "COMPETITOR 1") before sending, as with client names today. Counted in the AI monthly budget. If the AI is off or over budget, the pages still fill in, just without the written notes.

## Data sources (add-ons plug in the same way)
| Source | What it gives | Status / what's needed |
|---|---|---|
| **DataForSEO** (first) | Searches and cost per click per city, who ranks (live Google results + local 3-pack from each city), competitors, Google profile rating/reviews, ads seen + paid estimates, page speed (Lighthouse) | **Your DataForSEO API login** added in Vercel. **POST exception**: DataForSEO's API uses POST even to read; allowed only to the allowlisted read endpoints. |
| **LeadSnap** | Maps heat-map grid (7×7 ranks around the business) | **Need to confirm LeadSnap offers an API** (and its key). Until then: upload LeadSnap's export file on the audit, checked the same way. |
| **Semrush** (sometimes) | Visit and paid-search estimates, side by side, never merged | Off by default per audit (as today). **Needs a Semrush API plan** (priced separately; their API uses "units"). |
| Later add-ons | Anything with a read-only API | Each gets its own module, allowlist, cost estimate and on/off switch. |
- Backlinks: DataForSEO's backlink data may require a separate monthly subscription. If so, backlinks stay in the copy-paste prompt until you decide. **To confirm before building.**

## Money and limits
- **Rough cost per audit: $0.50–$2 of DataForSEO** (more cities and keywords = more), **+ a few cents of AI** for the words. To be confirmed against DataForSEO's current price list before building; the estimate shown to the rep is always the worst case.
- **Caps already in the database (0023) start counting real money:** $5 per audit, $10 a week per rep, $50 a month for everyone; owner can change them and set a per-rep cap. The worst-case estimate is written to the spending ledger **before** the run (like Scout), so the database itself refuses a run that would go over.
- One run at a time per audit; a run stops cleanly at the time limit and saves what passed.

## What changes in the app
- `src/lib/audit/sources/dataforseo.ts` (+ `leadsnap.ts`, `semrush.ts` when their access is confirmed): the only code that talks to each service; POST/GET only to listed endpoints; never sends anything about our clients.
- `src/lib/audit/run.ts` (pure, tested): which lookups an audit needs (from its checkpoints, cities, services, competitors), the worst-case cost, and turning answers into the results block.
- `startAuditRun` in `actions.ts`: checks role, caps and the estimate; records the run; does the work in the background (`after()`); attaches through the existing checker.
- **SQL `0035`** (next free number): `audit_runs` (status, steps, estimate and actual cost, who started it, errors; same who-can-see rules as audits; break-in tests) and the AI usage list gains `audit_words` (salespeople may log their own).
- Saved audit page: **Run audit** card with the cost line, progress, and errors in plain English. The copy-prompt and Attach results stay underneath as the backup.

## Risks and privacy (for review)
- **Real money:** protected by the database caps (not just the app) and the estimate-before-run rule.
- **Data leaves Atlas:** the prospect's website, town, services and competitors go to DataForSEO (and Semrush/LeadSnap when on) — the same as today's copy-paste route, just sent by Atlas. Codes-for-names to the AI. Nothing about existing clients is sent.
- **Exceptions to approve:** the DataForSEO POST exception; sending prospect numbers (not names) to the AI for the words. GoHighLevel stays GET-only, forever.
- **Wrong numbers:** much less likely than a chat (numbers come straight from the API, checked by the same rules), but services can be wrong or incomplete; reps still spot-check.

## Phases
- **E1: DataForSEO run** for SEO and Google Ads audits, words by AI, cost check, background run, `0035`. (Needs: your DataForSEO login in Vercel + the POST OK.)
- **E2: LeadSnap** (API or export upload) and **Semrush** (when you have an API plan).
- **E3: reuse and refresh** polish, cost reports per rep, add-ons.

## How it will be tested
- Pure tests with recorded, fictional service answers (no real calls in tests): lookups chosen, cost math, answers → results block → checker → pages.
- Guardrail tests: only the source modules call outside services, only listed endpoints, no secrets in the browser bundle, the AI gets no tools.
- Break-in tests for `audit_runs`.
- One real run with your login on a test prospect, the cost compared with DataForSEO's dashboard.

## Done means
- A rep taps Run audit on a phone, sees the cost, and a few minutes later the audit's pages show real numbers with sources and written notes, within the caps.
- Over-cap runs are refused by the database; the copy-paste route still works.
- `npm run check` and `npm run test:rls` pass.

## E1 as built (2026-11-25)
- `src/lib/audit/sources/dataforseo.ts`: the only DataForSEO caller (approved POST exception): one host, six allowlisted read-only "live" lookups, `DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD` from the server environment only, 30 s timeout, no redirects, answers size-capped. Guardrail tests pin all of it (the old "no POST anywhere" test now allows exactly this file).
- `src/lib/audit/run.ts` (pure): money keywords (each service × city + near me), the lookups per checkpoint, worst-case prices (`DFS_PRICE`, deliberately high), readers for each answer (wrong types → null), competitor finding (directories excluded), and answers → the same `ATLAS-RESULTS v1` block. Visit numbers are DataForSEO Labs US-wide estimates (marked "national"); backlinks stay "not found" (separate subscription).
- `src/lib/audit/words.ts`: coded numbers-only input for Claude (BUSINESS / COMPETITOR n, no websites), fixed answer shape, names put back; the checker still applies (a price or phone number in the words drops the words, keeps the numbers). SEO audits only (the Ads pages have no AI text).
- `startAuditRun` (actions.ts): role + edit rights, DataForSEO set up, no run in progress, `audit_runs` row, then the worst-case estimate into `audit_spend` (the database refuses over-cap runs), then the work in `after()`: lookups 6 at a time with a 120 s limit, words (AI budget via `ai_month_budget`), checker, save as `audits.data = { v: 1, block, by: "run" }`. Failed lookups leave gaps, never guesses.
- `RunAudit.tsx` on both audit pages (above the prompt, which is now "Or run it yourself"): cost first, steps while running (page refreshes every 4 s), the real cost after.
- `0035_audit_runs.sql`: `audit_runs`, `audit_words` AI feature (salespeople log their own), `ai_month_budget` view. Break-in tests 7cd.
- Known gaps: cities DataForSEO doesn't recognize (e.g. "Westminster & Thornton") come back "not found" for that city; enter one city per name. Call button / form on the landing page stay "not found" (no reliable read-only check yet).

## Places (2026-11-25)
- Google's own US place names (cities, townships, counties) from DataForSEO's free locations file (2026-11-02), kept as `src/lib/audit/us-places.json` (names only, ~316 KB, server-side) and rebuilt with `scripts/build-us-places.py` (`python3 -I scripts/build-us-places.py <csv> src/lib/audit/us-places.json`).
- Typing is cleaned (`src/lib/audit/places.ts`): "Westminster & Thornton" → two places; "Trumbull and Columbiana County" → Trumbull County, Columbiana County; "Warren, OH" → Warren.
- Builders suggest names for the home town and show ✓ / "did you mean …" under the cities (one state's list at a time via `getStatePlaces`). Saving checks every place on the server and uses Google's spelling; reading older audits never checks, so nothing old breaks.

