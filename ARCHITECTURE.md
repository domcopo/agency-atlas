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
   Supabase (a brand-new, separate project just for this app)
   private inbound schema → cleaned tables → RLS by team role
        │  reads as the signed-in team member, filtered by RLS
        ▼
   Agency Atlas UI (phone / browser, signed-in team members only)
```

**The GHL boundary is one-way.** Nothing points back up. There are no write scopes, no write endpoints, and no write-capable SDK in the codebase, so even a bug or a tricked AI cannot change, send, or schedule anything in GHL. Writing to *our own* Supabase database does not authorize writing to GHL. The app never texts, calls, or emails sellers or buyers.

## What exists today (Phase 1)

Only the bottom box. Synthetic fixtures stand in for everything above it.

```
src/fixtures/*.ts  →  src/lib/data-source.ts  →  src/app/* screens
   (fake data)          (DATA_MODE = "mock")       (server components + a few client components)
```

- Fixtures: leads, deals, buyers, conversations, mission-control, insights, safety, team.
- Screens: Mission Control, Leads, Deals, Dispo, More → Buyers Dex, Conversations, Insights, Data Safety. Bottom tabs: Home · Leads · Deals · Dispo · More.
- **No** database, sign-in, environment variables, API keys, server routes, or network calls.
- `next.config.ts` sends security headers. The Content Security Policy (CSP) sets `connect-src 'self'`, so the browser can only talk to our own site.
- PWA manifest only (installable icon). **No service worker**, so nothing is cached offline.
- Fonts come from the system font stack, so nothing downloads from Google.
- Runs locally at http://127.0.0.1:3200.

### The swap point: `src/lib/data-source.ts`

Every screen gets data through this one file. In Phase 2 its internals change from "return fixtures" to "query Supabase as the signed-in team member". The screens and `types.ts` shapes stay the same. That keeps the change small and reviewable, and it means fake and real data never mix.

## Phase 2 decisions (made by the user, NOT started — needs separate approval)

- **Database:** a brand-new hosted Supabase project created by the user, kept apart from their other Supabase projects. An existing project is never reused.
- **Local test copy:** Supabase running in Docker on this computer, used only for automated row-level-security (RLS) tests that try to break the access rules.
- **Keys:** the user runs `supabase link` / `db push` themselves. Claude never sees the database password, access token, or secret key. The app uses only the **publishable** key; the secret/service-role key is never used by the app.
- **Access model (one team):**
  - `owner` — sees everything.
  - `acquisitions` — leads/deals assigned to them, *or* team-wide read (to be confirmed in Phase 2 planning).
  - `dispositions` — deals in dispo + buyers.
  - Enforced by Supabase RLS + grants and tested, never by hiding buttons.

## Why one Next.js app

One codebase holds the screens and (later) the server routes. It's easier to learn, review, and audit than separate frontend/backend projects. We'll split out a background worker only when webhook volume, retries, or processing time make it necessary.

## Hosting (deferred to Phase 4)

Phase 1 runs only on this computer. Hosting waits until Phase 4, because GHL webhooks need a public HTTPS server.

| | Render | Railway |
|---|---|---|
| Pricing | Fixed monthly per service, so easy to budget | Usage-based, which can surprise you |
| Background workers / cron | Mature, built in | Available |
| Secrets | Environment-variable secrets | Sealed variables |
| Developer experience | Solid | Very smooth |

No choice is final. Either costs roughly $5–25/month at this scale; verify current pricing in Phase 4. Neither host fixes insecure code or permissions for us.

## Phase roadmap

| Phase | Scope | Advance only when |
|---|---|---|
| 0 | Scope, threat model, data map, privacy checklist | We can say exactly what the app may and may not do |
| 1 | Mock-data prototype (reworked for wholesale), DEMO banner | Phone-friendly demo works; no live integrations exist |
| 2 | New separate Supabase project, local Docker copy for RLS tests, migrations, Auth (MFA), roles + RLS + grants, nonce-based CSP | Each role sees only what it should; anonymous reads fail; break-the-rules tests pass |
| 3 | ONE read-only GET to our GHL account, server-side token, `.readonly` scope | Only the allowed GET occurs; redacted field map reviewed |
| 4 | Private OAuth Marketplace app, webhooks, Ed25519 verify, idempotent staging table, hosting (Render or Railway) + HSTS | Invalid, replayed, or duplicate events can't create records |
| 5 | First real data: KPIs, appointments, pipeline, conversation *metadata* | Data is accurate, role-restricted, and recoverable; privacy checklist done |
| 6 | Calculated lead grades, buyer matching, evidence-cited AI suggestions (no tools) | Every suggestion shows its reasons, uncertainty, and a human review path |
| 7 | Security review, restore test, monitoring, kill switch | We understand failure handling and can safely disable all sync |
