# Plan: custom audit builder in Sales

Status: **approved 2026-11-24. Phase A built** on branch `audit-builder` (not merged; `0023` not run yet). Builds on and replaces "Part B" in `docs/SALES_SIMPLIFY_PLAN.md` (same migration `0023`, same roles and spending caps). Rules from `docs/SEO_AUDIT_PLAN.md` still apply to every page: no made-up numbers, every figure has a source and date, missing = "not found", money is a labeled model.

## What the owner asked for
- A spot in **Sales** where a rep types in a business and the app builds our **custom SEO audit prompt** from it.
- **Checkpoints** to pick what goes in: SEO audit or Google Ads audit, competitor analysis, heat map, SEO timeline, investment, and other sections, per business.
- **Saved audits**, so we don't pay to pull the same data twice.
- Later: a map that looks like the real state (and real streets), like the owner's earlier examples.
- Clean on phone and desktop.

## How it works for a rep
1. **Sales → Audits → New audit** (or "Audit this lead" on a lead page, name filled in).
2. **Step 1, the business:** website, business name, town + state, niche, Google Business Profile link (optional), average job ($, "assumption" until the client confirms), share of visits that become jobs (default 3%, "assumption"), up to 5 competitors (optional; "find them for me" is left blank for the audit run to fill).
3. **Step 2, audit type:** ☐ SEO audit ☐ Google Ads audit. (Ads shows "coming soon" until it has its own plan; see Phase D.)
4. **Step 3, checkpoints** (each is a page or block; tap to turn on/off; presets at the top):

   | Checkpoint | Page | Default |
   |---|---|---|
   | Summary + competitor revenue + goal | 1 | always on |
   | Map rankings / heat map | 2 | on |
   | Region footprint map | 3 | on |
   | Competitor analysis | 4 | on |
   | Top fixes | 5 | on |
   | Money keywords | 6 | on |
   | Revenue opportunity | 7 | on |
   | SEO timeline (growth chart) | 8, top | on |
   | Investment (3 plans) | 8, bottom | on |
   | **New, suggested:** Reviews gap (rating, count, how fast competitors add reviews) | small block | off |
   | **New:** Website health (speed, mobile, broken basics, Google Lighthouse) | new page | off |
   | **New:** AI search check (does ChatGPT / Google's AI answer mention them or competitors) | new page | off |
   | **New:** Backlink gap (sites linking to competitors but not to them) | new page | off |

   Presets: **Quick look** (pages 1, 2, 5, Investment), **Full local SEO** (everything on), **Competitor deep dive** (1–4, 6, backlink gap).
5. **Step 4, data sources + cost:** DataForSEO (on), LeadSnap (on when we have it), Semrush (off by default). Shows the pre-run estimate and the caps ("$0.80 estimate, $5 cap per audit, $3.20 of $10 used this week").
6. **Save.** The audit appears in **My audits**. From it the rep can:
   - **Copy the custom prompt**: the `docs/SEO_AUDIT_PROMPT.md` prompt, filled in with this business and only the chosen checkpoints. Copy-only: the app never runs or sends it. (Today the data pull runs in Claude Code, where DataForSEO is connected.)
   - **Open the audit**: only the chosen pages, "not found" until results are attached.
   - **Attach results** (Phase B): paste or upload the results file the run produces; the app checks it strictly and stores it.

## Not pulling the same data twice
- Results are stored with the audit, with their retrieval date.
- Starting an audit for a website that already has results from the last **30 days** shows: "Saved Nov 24: reuse (free) or refresh (costs ~$X)". Reuse copies the saved figures; dates stay the real retrieval dates.
- The 30 days is a constant (`AUDIT_REUSE_DAYS`) the owner can change.

## Screens (phone and desktop)
- **Phone:** one step per screen with Back/Next, big tap targets, a sticky bottom bar with "Save" and the cost line. Checkpoints are big toggle rows with a one-line "what this shows".
- **Desktop (1024 px+, using the new side-menu layout):** form on the left, live list of chosen pages (small thumbnails) and the cost box on the right.
- **Sales tab:** an "Audits" card with the 3 newest and "New audit". Owner/managers also keep Growth → SEO audits (all audits).
- **Viewer `/audit/[id]`:** opens for salespeople, only for their own audits (the database decides). Print/PDF as today.

## Phases (each one checked before the next)
- **Phase A: builder + saved audits** (this replaces Part B). Migration `0023`: `audits` (adds `sections` and `kind` to the Part B columns), `audit_limits`, `audit_user_limits`, `audit_spend`, RLS + `aal2` + break-in tests. Builder form, My audits, section on/off in the deck, copy-prompt, caps shown. **Costs $0, fetches nothing.**
- **Phase B: attach results + reuse.** A strict checker for the results file (`parseAuditData`, every figure must carry source + date, size limit), the 30-day reuse offer. Still no network from the app.
- **Phase C: real-looking maps.** See "Maps" below.
- **Phase D: Google Ads audit.** Its own plan. For prospects: competitor ads, keywords they bid on, estimated spend (DataForSEO / Semrush paid-search data). For clients: their own Google Ads account, read-only, which needs a separate OK.
- **Phase E: the app pulls the data itself** (the old audit Phase 4: DataForSEO adapter, the caps start to matter). Needs the POST exception approval, since DataForSEO's API takes POST for reads.
- **Later:** AI-written page notes (Phase 6), new suggested pages as their data comes online.

## Maps (Phase C), two choices
1. **Detailed real outline, drawn by the app (recommended first).** Accurate state shape and county lines from free US Census map files, the client and competitors pinned at their real spots, rankings coloured per city. No outside service, no cost, works in the PDF, nothing about the prospect leaves the app.
2. **Real street map underneath (like Google Maps).** Looks most like the owner's examples. Needs a map-tile service (OpenStreetMap-based or Mapbox, free tier likely enough; Google Static Maps ~$2 per 1,000 maps). Each view tells that service which area we're looking at, and the site's security settings must allow it. Can come after option 1.

The owner's earlier map examples would help pick; drop one in the chat or in `docs/seo-audit-reference/` (Git-ignored).

## Risks and privacy (for review)
- Audits hold business facts about prospects (website, town, competitors). The form refuses email addresses and phone numbers, like reach-out notes.
- Pasted results are untrusted data: checked field by field, shown as plain text, never used as instructions.
- Copy-prompt text contains the prospect's business details; it's copied by a person into Claude Code, never sent by the app.
- **Overlap with other work:** `src/app/(app)/sales/page.tsx`, the lead page, `sales/setup` and Growth → SEO audits have uncommitted desktop-layout changes from another session. Build on its own branch after those are committed, or wait for them.

## Done means (Phase A)
- A salesperson builds and saves an audit on phone and desktop, picks checkpoints, copies the prompt, and opens a deck with only those pages.
- Owner/managers see all audits; a salesperson sees only their own; a developer sees none (break-in tests).
- Before `0023` is run, saving says "needs 0023" and nothing else breaks.
- `npm run check` and `npm run test:rls` pass.
