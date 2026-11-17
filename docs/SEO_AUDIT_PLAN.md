# SEO audit (and later Google Ads audit): plan

Approved 2026-11-17 (Phase 1). Each later phase needs its own approval.

## What it is

An eight-page, 1280×720 audit for a client or prospect, built from per-client settings
plus collected data. Visual reference: the three sample PDFs in `docs/seo-audit-reference/`
(Git-ignored: they are real client audits and stay on this Mac). No client's data,
services, markets or competitors are copied into code.

## Rules for every audit

- No made-up numbers. Every figure is a `Fig` with a source and a retrieval date; missing = "not found".
- Code computes every number (`src/lib/audit/compute.ts`). The AI (Phase 6) writes words only, from the computed numbers.
- Modeled revenue is labeled "model" and prints its inputs. Job values and rates show "assumption" until the client gives real figures (`basis: "client_supplied"`).
- Semrush and DataForSEO figures sit side by side, never merged. Semrush is off by default.
- Unconfirmed claims are flagged on the page (`Fig.unverified`, e.g. "not surfaced in Maps").
- Prices, plans, hours, job values and rates come only from the settings.
- Local pack: `packPosition` 0 = checked and not in the pack; null = not found.
- Region map: `map.state` picks the outline (OH for now), markets carry latitude/longitude and must sit inside the state; `map.ringsMiles` draws rings around the home base.

## Where things live

| Piece | File |
| --- | --- |
| Settings shape + check | `src/lib/audit/config.ts` (`parseAuditConfig`, `AUDIT_DEFAULTS`, `AUDIT_LIMITS`) |
| Data shape | `src/lib/audit/data.ts` (`Fig`, `AuditData`, `AuditBundle`) |
| Math | `src/lib/audit/compute.ts` (pure, tested) |
| Display helpers | `src/lib/audit/format.ts` |
| State outlines + map math | `src/lib/audit/geo.ts` (Ohio only for now; add a state by adding its outline) |
| Sample (fictional, $0 dry run) | `src/fixtures/audit-sample.ts`, read via `getAuditPreview()` in `data-source.ts` |
| Shared styles | `src/components/audit/audit.css` (scoped to `.audit`, print = one page per slide) |
| Components (one file each) | `src/components/audit/*.tsx` |
| Eight pages | `src/components/audit/pages/*.tsx` |
| Screens | `/growth/audits` (list), `/audit/[id]` (viewer, outside the tabs, owner/manager only) |
| Tests | `tests/audit.test.ts` (settings, math, sample rules, rendered check of all 8 pages) |

## Phases

1. **Settings format, data shape, sample data, template (DONE 2026-11-17).** No database, no network, $0.
2. Polish the components from feedback (map, chart, spacing); add CSV export of the computed tables. Done so far (2026-11-17): real Ohio outline map, cut-off fixes, cleaner growth chart, sample moved to Ohio cities.
3. Intake form (website, location, Google profile, average ticket, niche, competitors) + saving audits: migration `0023`, owner/manager RLS, break-in tests.
4. DataForSEO adapter, cost ledger, pre-run estimate, per-run budget cap (default $5), dry-run switch. Needs approved exceptions: one network module, and POST only to allowlisted DataForSEO read endpoints (DataForSEO sends reads as POST). GoHighLevel stays GET-only.
5. LeadSnap adapter (API docs needed), then Semrush (optional, off by default).
6. AI narrative via `src/lib/ai/client.ts` (new `AI_BOTS` entry), company name swapped for a code.
7. One-click PDF (Playwright on this Mac only, needs approval to add the package) and CSV downloads. Until then: browser Print → Save as PDF.
8. Google Ads audit: same intake + template, public data only (competitor ads, keyword CPCs) unless account access is approved separately.

## Open questions

- Who may run audits: owner/managers only (current), or salespeople too?
- "How much they sell it for": average job price (used now as average ticket), or profit per job?
- LeadSnap: API access and docs.
- Default budget cap per run: $5 (current default).
