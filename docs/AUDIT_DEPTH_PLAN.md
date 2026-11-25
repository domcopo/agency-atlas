# Plan: make Run audit as deep as the owner's hand-built audits

Status: **D1 built (owner approved 2026-11-25; branch `audit-depth`), waiting for a live test run to confirm the cost. D2–D4 not started (each needs a yes).** Builds on Run audit (`docs/AUDIT_RUN_PLAN.md`, E1). Compared against two of the owner's finished audits (real clients; read for structure only, nothing from them is copied here or into the app).

## Why the Atlas audit feels thinner
The page **layout** already matches the owner's audits (same 8 pages). The gap is the **data and the thinking behind it**:

| The owner's audits have | Atlas today |
|---|---|
| A full **keyword universe**: hundreds of seller/service-intent searches incl. variants ("we buy houses", "sell my house fast", "cash buyers…"), situations (probate, foreclosure…), grouped by town, county and region, deduplicated | Each typed service × each city (a handful); depends on how the rep phrased the services |
| **Local competitor model**: visits modeled from each competitor's *actual local rankings* ("positioned for N searches", top-3 / top-10 counts), raw tool estimate beside it | A US-wide traffic estimate per site (labeled "national") |
| **Rankings by market** for every site (table across 6–8 towns/regions), striking-distance terms | 2–6 searches from the home town only |
| **Authority, real referring domains, link gap**, branded searches | Not pulled (backlink data needs a separate plan) |
| **Live site inspection**: title/H1, broken or duplicate pages, phone link mismatch, template text, profile category | Nothing; the "fixes" page has no site facts to work from |
| **"What they built"**: the competitors' city/county page URLs | Not shown |
| **Niche funnel** (e.g. visit→lead→contract→close × deal value), "the prize" (+250 / +500 / +1,000 visits), month-12/18 projection with conservative / expected / aggressive curves | One visit→job rate × average job |
| **Plan page in hours**: one-time setup table, three monthly programs (hours + price), time frame to the top spots at each pace | A generic three-phase roadmap |
| **Specific written insight** from all of the above | Short notes from thin data (and, until today's fix, notes dropped by a too-strict rule) |

## The upgrade, in phases (each checked before the next)
- **D1 · Data depth (DataForSEO only, no new vendor).**
  - Keyword discovery from short seed searches the rep confirms (e.g. "we buy houses", "sell my house fast", "cash home buyers"), with town modifiers for the chosen places; intent-filtered, deduplicated, grouped by town / county / region; Google Ads volumes for the state.
  - Ranked keywords for the business and each competitor (DataForSEO Labs), filtered to this market → click-through-modeled **local** visits, "positioned for", top-3 / top-10, positions by market, striking distance.
  - Live Google checks for 2–3 core searches from each chosen town (positions + map pack + reviews).
  - Branded searches for every site.
  - Homepage inspection of the business (title, H1, meta, links, schema present, "more than one phone number" flagged without printing numbers) and competitor ranking-page URLs ("what they built").
  - New read-only lookups added to the allowlist (still one module, still read-only). Rough cost **$1–3 per audit** (to confirm on a test run); caps unchanged.
  - **As built:** `src/lib/audit/depth.ts` (pure) + `planSeoRun`/`seoUniverse`/`buildSeoBlock` in `run.ts`. Order of a run: suggestions + live Google checks → state search counts (+ difficulty) for the universe → competitors → per site: rankings, Google profile, homepage check (business only), then brand searches → Claude's words → checker → save. Not in D1 after all: per-town live checks beyond the existing heat-map packs, "more than one phone number" and schema checks (instant_pages doesn't report them reliably), striking-distance list (data is there; page layout is D2).
- **D2 · Model and pages.** Niche funnel presets in Settings (e.g. home buyers: 4% lead, 15% contract, 80% close, $20,000 per deal; home services: lead and close rates), "the prize" scenarios, the 12/18-month projection with three curves, the plan page with setup hours and three programs from Settings.
- **D3 · Authority and links.** Needs a choice: DataForSEO's backlink data (separate monthly subscription; price to confirm) or Semrush's API (also paid). Adds authority, real vs scraper links, the link gap table.
- **D4 · Richer written insight.** Claude gets the inspection facts, competitor page patterns and the model results (still numbers it's given, never its own) to write "why they rank higher", five fixes with timing, and the page notes.
- **Later.** Search Console (read-only, with the client's permission) for measured clicks on client audits.

## Questions for the owner
1. Start with D1 (data depth) as recommended?
2. For D3 (links): DataForSEO backlinks or Semrush? Either is a monthly cost; I'll price both before asking for a yes.
3. Funnel presets: which niches first (home buyers, roofing/home services, …)?

## Risks
- More lookups = more cost per audit; the database caps still stop overruns, and the estimate is shown before every run.
- More data from third parties = more chance of odd numbers; every figure keeps its source and date, and the checker's ranges apply.
- No client names or numbers from the reference audits are used anywhere in the app or its tests.
