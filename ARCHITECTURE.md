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

Only the bottom box. Synthetic fixtures stand in for everything above it.

```
src/fixtures/*.ts  →  src/lib/data-source.ts  →  src/app/* screens
   (fake data)          (DATA_MODE = "mock")       (server components + a few client components)
```

- **No** database, sign-in, environment variables, API keys, server routes, or network calls.
- `next.config.ts` sends security headers. The Content Security Policy (CSP) sets `connect-src 'self'`, so the browser can only talk to our own site.
- PWA manifest only (installable icon). **No service worker**, so nothing is cached offline.
- Fonts come from the system font stack, so nothing downloads from Google.

### The swap point: `src/lib/data-source.ts`

Every screen gets data through this one file. In Phase 2 its internals change from "return fixtures" to "query Supabase as the signed-in user". The screens and `types.ts` shapes stay the same. That keeps the change small and reviewable, and it means fake and real data never mix.

## Why one Next.js app

One codebase holds the screens and (later) the server routes. It's easier to learn, review, and audit than separate frontend/backend projects. We'll split out a background worker only when webhook volume, retries, or processing time make it necessary.

## Hosting (decide in Phase 4)

Phase 1 runs only on this computer.

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
| 1 | Mock-data prototype, 5 screens, DEMO banner | Phone-friendly demo works; no live integrations exist |
| 2 | Separate dev Supabase project, migrations, Auth (MFA), RLS + grants, nonce-based CSP | Unauthorized and cross-client reads fail; authorized reads succeed |
| 3 | ONE read-only GET to ONE test sub-account, server-side token, `.readonly` scope | Only the allowed GET occurs; redacted field map reviewed; no real client data kept |
| 4 | Private OAuth Marketplace app, test-account webhooks, Ed25519 verify, idempotent staging table, hosting + HSTS | Invalid, replayed, or duplicate events can't create records |
| 5 | One consenting client: KPIs, appointments, pipeline trends, conversation *metadata* | That client sees accurate, isolated, recoverable data |
| 6 | Business Dex observations/surveys, evidence-cited AI suggestions (no tools) | Every claim has an origin, uncertainty, and human review path |
| 7 | Security review, restore test, monitoring, kill switch, wider rollout | We understand failure handling and can safely disable all sync |
