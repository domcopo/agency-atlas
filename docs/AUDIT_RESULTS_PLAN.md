# Plan: attach audit results (SEO + Google Ads)

Status: **approved 2026-11-25. B1 built** on branch `audit-results` (no database change). B2 not started. This is "Phase B" of `docs/AUDIT_BUILDER_PLAN.md` and the matching step for Google Ads audits (`docs/AUDITS_HUB_ADS_LEADERBOARD_PLAN.md`). Rules from `docs/SEO_AUDIT_PLAN.md` still apply: no made-up numbers, every figure has a source and a date, missing = "not found", money is a labeled model.

## The problem (seen by the team 2026-11-24)
A rep builds an audit in Atlas, copies the custom prompt, runs it in Claude (with DataForSEO), and gets a report back. But there is **no way to bring those numbers back into the saved audit**, so its pages keep saying "not found". The prompt's last step also asks for "the AuditConfig / AuditData shapes", which a normal Claude chat doesn't know, so what comes back is a free-form report (e.g. a `.md` file), not something Atlas can read.

## How it will work for a rep
1. Build and save the audit (as today).
2. Copy the custom prompt and run it in Claude (as today). **New:** the prompt ends with an exact fill-in-the-blanks template, so Claude's last message is one block that starts `ATLAS-RESULTS v1` and holds the numbers, each with its source and date.
3. Back in Atlas, open the saved audit → **Attach results** → paste Claude's whole last message (or drop in the `.md` / `.json` file it produced). Atlas finds the block by itself; nothing else in the message is used.
4. Atlas checks it and shows a short preview before saving: "Found 38 keywords, 5 competitors, 9 cities, 3 heat-map checks. 2 problems: …".
5. **Save.** The pages fill in with the real numbers. Print / Save as PDF as today.
6. Attaching again later **replaces** the results (the date updates), e.g. for a refreshed audit.

## The checker (the important part)
Pasted results are **untrusted data**: they come from a chat, not from us. Atlas reads them field by field and never runs them, never uses them as instructions, and shows every piece of text as plain text.
- **Every figure** must be `{ value, source, retrieved }`. Source must be one of DataForSEO, Semrush, LeadSnap or "Google (live check)"; the date must be real and not in the future. A missing value stays "not found".
- **Right business:** the website in the results must match the saved audit's website, and competitor websites must look like real domains. Results for another business are refused.
- **Sensible ranges:** e.g. searches 0–10,000,000 a month, rank 1–100, rating 0–5, cost per click $0–$1,000, speed score 0–100. Anything outside is refused with a plain-English reason.
- **No personal contact details:** no email addresses or phone numbers anywhere, same as the intake.
- **No prices from the chat:** plan prices always come from the owner's settings, never from the results.
- **Size limit:** at most 400 KB of results (the database allows 2 MB). Unknown fields are dropped.
- **Competitors found by the run** (when the rep left them blank) are taken from the results, up to 5, and saved with the audit so every page lines up.
- **Words** (headline, page notes, top fixes) are kept short (limits per field) and labeled as written from the numbers.

## What changes in the app
- `src/lib/audit/results.ts` (new, pure, tested): `extractResultsBlock` (finds the `ATLAS-RESULTS v1` block in pasted text), `parseSeoResults` → AuditData + the competitors found, `parseAdsResults` → AdsData. Same rules for both.
- Prompts (`src/lib/audit/prompt.ts`, `src/lib/audit/ads-prompt.ts`): the last step becomes the exact template, filled with this audit's website, cities and competitors, and only the checkpoints picked.
- Saved audit page (`/audits/[id]`): an **Attach results** card (paste box + file picker, read in the browser as text only, never uploaded or stored as a file) with the preview, then Save. Shows "Results from Nov 25 (DataForSEO)" once attached.
- `attachAuditResults` in `src/app/actions.ts`: checks the role and runs the checker on the server again (never trusts the browser's preview), then saves `data`, `config` (competitors found) and `data_retrieved` on the audit, as the signed-in person.
- `data-source.ts`: the pages use the saved results when there are some, "not pulled yet" otherwise.
- **No database change.** `audits` already has `data`, `config` and `data_retrieved`, and the rules already let owner/managers update any audit and a salesperson only their own, not archived (`0023`, break-in tests 7t).

## Phases
- **B1 (this plan): attach results for SEO and Google Ads.** Checker, new prompt endings, Attach card, save. Costs $0; Atlas still fetches nothing.
- **B2 (later, small):** "We audited this website on Nov 25: reuse (free) or refresh" when starting a new audit for a website with results from the last 30 days; record the run's cost in the spending caps.
- **Later:** Atlas runs the data pull itself (Phase E; needs the DataForSEO approval).

## Risks and privacy (for review)
- **A chat can still get numbers wrong.** The checker catches wrong shapes, wrong business, impossible values and missing sources, not a believable-but-wrong number. Every page keeps showing the source and date, and reps should spot-check a couple of figures before sending an audit.
- Results hold business facts about prospects (as audits already do). No personal contact details are accepted.
- Pasted text is never shown as HTML, never sent anywhere, never given to the AI.

## How it will be tested
- Unit tests: a full fictional SEO and Ads result set passes; each rule above refuses a bad copy (wrong website, future date, no source, email inside, rank 500, 2 MB paste, a price in the results); the block is found inside a long chat reply; the pages render real numbers and "not found" where a value is missing.
- Break-in tests: unchanged rules, plus a check that a salesperson can't attach results to someone else's audit or an archived one.
- In the browser: paste the fictional results on a phone and a computer, check the preview, save, open the pages.
- With the team: one real audit end to end (the Denver one is a good first try).

## Done means
- A rep runs the prompt, pastes Claude's reply into Attach results, and the audit's pages show the real numbers with sources and dates, for both SEO and Google Ads audits.
- Bad or wrong-business results are refused with a clear reason; nothing is saved until they pass.
- `npm run check` and `npm run test:rls` pass.

## B1 as built (2026-11-25)
- `src/lib/audit/results.ts`: `extractResultsBlock` (finds `ATLAS-RESULTS v1` + the JSON object after it, even inside a long reply; 400 KB max), `parseSeoResults` → AuditData + competitors (rep's first, then the run's, up to 5), `parseAdsResults` → AdsData, `seoResultsTemplate` / `adsResultsTemplate` (the prompts' new last step). A bare number in the block uses the block's own `source` + `retrieved`; a figure can name its own. Cities must be this audit's cities (others skipped with a warning); ranks only for the business and its competitors.
- `attachAuditResults` (actions.ts): mode "check" (preview) or "save"; re-checks on the server; stores `audits.data = { v: 1, block }`, `config = { competitors }` (SEO), `data_retrieved`. Pages re-check the stored block on every read (`getSavedAuditBundle`, `getSavedAdsBundle`), so only what passes the rules is ever drawn.
- `AttachResults.tsx` on both audit pages (owner/managers; a salesperson on their own, not archived). Viewer note says "Results from <date> (<sources>) … spot-check".
- Break-in tests 7cc; unit tests `tests/audit-results.test.ts`.
- Not yet: map pins from results (cities still have no map position), B2 (reuse + spend).
