# Architecture

## The big picture (later phases)

```
   GoHighLevel  (source of truth — we NEVER change it)
        │  ① our server asks: allowlisted GET requests only   (Phase 3)
        │  ② GHL notifies us: signed webhooks                 (Phase 4)
        ▼        ── data only flows DOWN ──
 ┌───────────────────────────────────────────────┐
 │  Ingestion backend (Next.js server routes)    │
 │  • GET-only allowlist; no write code exists   │
 │  • verifies Ed25519 X-GHL-Signature on raw    │
 │    request bytes; rejects missing/invalid     │
 │  • validates, strips unneeded fields, dedupes │
 │  • logs metadata only                         │
 └───────────────────────────────────────────────┘
        │  writes using a restricted, server-only role
        ▼
   Supabase (our own database, separate dev project first)
   private inbound schema → cleaned tables → RLS per client
        │  reads as the signed-in staff member, filtered by RLS
        ▼
   Agency Atlas UI (phone / browser, signed-in staff only)
```

**The GHL boundary is one-way.** Nothing points back up. There are no write scopes, no write endpoints, and no write-capable SDK in the codebase, so even a bug or a tricked AI cannot change, send, or schedule anything in GHL. Writing to *our own* Supabase database does not authorize writing to GHL.

## What exists today (Phase 1)

Only the bottom box. Two kinds of data feed it, and every screen labels which is which.

```
private-data/clients.json, team.json ─▶ src/lib/private-data.ts ─┐
   (REAL, this Mac only, Git-ignored)      (server-only, validates) │
                                                                    ├─▶ src/lib/data-source.ts ─▶ src/app/* screens
src/fixtures/*.ts ──────────────────────────────────────────────────┘     (DATA_MODE = "mock")
   (SAMPLE: prospects, conversations, work orders, case studies, trends, insights)
```

- **Real client list (user-approved, interim).** `private-data/` is listed in `.gitignore`, so it is never committed or pushed. Folder permission `700`, files `600` (only your macOS user can read them). Only `src/lib/private-data.ts` reads it, using `node:fs`, which means it can only run on the server and never ships to the browser. Every record is checked (name 1–80 characters with hidden control characters removed, amount 0–100,000, ISO date, known status); bad records are skipped and counted, never shown.
- **Fallback.** If the folder is missing (automated tests, another computer), the app shows a fictional demo roster that passes the same checks.
- **Sample data is never attached to a real client or team member.** Work orders use "Sample client: …" labels and "Developer A–D (sample)".
- **Wi-Fi mode is blocked** by `scripts/guard-phone.mjs` while `private-data/` exists, because there is no sign-in.
- **No** database, sign-in, environment variables, API keys, server routes, or network calls.
- `next.config.ts` sends security headers. The Content Security Policy (CSP) sets `connect-src 'self'`, so the browser can only talk to our own site.
- PWA manifest only (installable icon). **No service worker**, so nothing is cached offline.
- Fonts come from the system font stack, so nothing downloads from Google.

### The swap point: `src/lib/data-source.ts`

Every screen gets data through this one file. In Phase 2 its internals change from "read fixtures + the private file" to "query Supabase as the signed-in user". The screens and `types.ts` shapes stay the same. That keeps the change small and reviewable, and keeps real and sample data clearly separated.

### Phase 2 plan (proposed, waiting for approval)

- A **brand-new, separate hosted Supabase project** that you create yourself. Claude never sees the database password or secret key; the app uses the publishable key only, with access rules (RLS) doing the protecting.
- A **local Docker copy of Supabase** for automated "break-in" tests of those access rules.
- Tables: clients/subscriptions, prospects, conversations (metadata + preview), work_orders, team_members, case_study_metrics, survey_questions, survey_responses (+ consent), insights, audit_logs.
- Access by role: the owner sees everything (including pay/bonus); managers get a narrower view (exact limits to be decided); developers see their own work.
- The private file is imported into Supabase, checked, and then deleted from this Mac.
- GoHighLevel stays read-only forever and is not part of Phase 2.

## Why one Next.js app

One codebase holds the screens and (later) the server routes. It's easier to learn, review, and audit than separate frontend/backend projects. We'll split out a background worker only when webhook volume, retries, or processing time make it necessary.

## Hosting (deferred to Phase 4)

Phase 1 runs only on this computer. Phase 2 uses hosted Supabase for the database only; the app itself stays local until Phase 4.

| | Render | Railway |
|---|---|---|
| Pricing | Fixed monthly per service, so easy to budget | Usage-based, which can surprise you |
| Background workers / cron | Mature, built in | Available |
| Secrets | Environment-variable secrets | Sealed variables |
| Developer experience | Solid | Very smooth |

**Provisional choice: Render**, for predictable cost. Either costs roughly $5–25/month at this scale; verify current pricing. We'll confirm in Phase 4. Neither host fixes insecure code or permissions for us.

## Phase roadmap

| Phase | Scope | Advance only when |
|---|---|---|
| 0 | Scope, threat model, data map, privacy checklist | We can say exactly what the app may and may not do |
| 1 | Prototype: sample data + real client list from a private, Git-ignored file; data banner | Phone-friendly demo works; no live integrations exist; real names never reach Git |
| 2 | New separate Supabase project + local Docker copy, migrations, Auth (MFA), role-based RLS + grants, import then delete private file, nonce-based CSP | Unauthorized and cross-client reads fail; authorized reads succeed |
| 3 | ONE read-only GET to ONE test sub-account, server-side token, `.readonly` scope | Only the allowed GET occurs; redacted field map reviewed; no real client data kept |
| 4 | Private OAuth Marketplace app, test-account webhooks, Ed25519 verify, idempotent staging table, hosting + HSTS | Invalid, replayed, or duplicate events can't create records |
| 5 | One consenting client: KPIs, appointments, pipeline trends, conversation *metadata* | That client sees accurate, isolated, recoverable data |
| 6 | Business Dex observations/surveys, evidence-cited AI suggestions (no tools) | Every claim has an origin, uncertainty, and human review path |
| 7 | Security review, restore test, monitoring, kill switch, wider rollout | We understand failure handling and can safely disable all sync |
