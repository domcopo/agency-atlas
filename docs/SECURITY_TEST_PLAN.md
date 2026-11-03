# Security Test Plan

Regression tests that must keep passing as the app grows. **Passing tests is not a security guarantee.** These tests catch known mistakes; they don't prove the absence of others. Human review and, later, an independent security review are still required.

Run everything with `npm run check`. **Never weaken or delete one of these tests to make a build pass.** Fix the cause, or stop and ask.

## Regression tests

| # | Test | What it proves | Status | Where |
|---|---|---|---|---|
| 1 | No GHL non-GET methods | Code contains no `POST`/`PUT`/`PATCH`/`DELETE` request methods | **Active (Phase 1)** | `tests/guardrails.test.ts` |
| 1b | No GHL hosts in Phase 1 | No `leadconnectorhq.com`, `gohighlevel.com`, `msgsndr.com` anywhere in `src/`, `public/`, `next.config.ts` | **Active (Phase 1)** | `tests/guardrails.test.ts` |
| 1c | No network calls in Phase 1 | No `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon` | **Active (Phase 1)** | `tests/guardrails.test.ts` |
| 1d | GHL module allowlist | The GHL module refuses any method but GET and any path not on the allowlist | Planned (Phase 3) | — |
| 2 | No write scopes | Configured GHL scopes all end in `.readonly`; no write scope anywhere in config | Planned (Phase 3) | — |
| 3 | No exposed secret keys | No JWTs, `sk_live`, private keys, `service_role`, GHL `pit-` tokens, or Bearer tokens in code; no secret-named `NEXT_PUBLIC_` vars; `.env.example` has no values; `.gitignore` blocks `.env`; no `.env` files present | **Active (Phase 1)** | `tests/guardrails.test.ts` |
| 3b | No GHL / Supabase / axios packages yet | `package.json` contains none of them | **Active (Phase 1)** | `tests/guardrails.test.ts` |
| 4 | Invalid webhook signatures rejected | Missing, malformed, or wrong Ed25519 `X-GHL-Signature`, and modified bodies, return an error and store nothing | Planned (Phase 4) | — |
| 5 | Duplicate webhooks not duplicated | Same event delivered twice or out of order creates exactly one record | Planned (Phase 4) | — |
| 6 | Role rules can't be broken | Against a local Docker Supabase: anonymous users read nothing; dispositions can't read seller motivations/notes or non-dispo leads; acquisitions can't read buyers (and, if "assigned only" is chosen, can't read others' leads); nobody but owner reads `audit_logs`; no role can insert/update/delete outside its rules | Planned (Phase 2) | — |
| 7 | Data deletion works | Deleting a lead or buyer removes its rows (and derived insights, notes, follow-ups) per the retention rules | Planned (Phase 5) | — |
| 8 | Untrusted message text cannot cause actions | Injection examples from `docs/THREAT_MODEL.md` produce no tool calls, writes, sends, or executed URLs | Planned (Phase 6) | — |
| 9 | No raw HTML / code execution | No `dangerouslySetInnerHTML`, `innerHTML =`, `eval`, `new Function` | **Active (Phase 1)** | `tests/guardrails.test.ts` |
| 10 | No offline caching | No service worker files or registration | **Active (Phase 1)** | `tests/guardrails.test.ts` |
| 11 | Fake data stays fake | Every record `isSynthetic: true`; emails `@example.com`; phones `555-01XX`; seller/buyer names, companies, and cities contain "(fictional)"; IDs unique | **Active (Phase 1)** | `tests/fixtures.test.ts` |
| 12 | Money never invented | `unknown` has no amount; `confirmed`/`estimated` have a basis; estimates have low < high | **Active (Phase 1)** | `tests/fixtures.test.ts` |
| 13 | References are real | Deals, follow-ups, conversations, alerts, activity, buyer interest, and insight evidence point to records that exist; a demo message containing an "instruction" changes nothing | **Active (Phase 1)** | `tests/fixtures.test.ts` |
| 14 | GHL has zero write targets | `ghlWriteTargets` is always empty | **Active (Phase 1)** | `tests/fixtures.test.ts` |

## Manual checks each phase

- Review every dependency added (why, maintainer, alternatives). Run `npm audit`.
- Confirm the security headers in the browser's network tab.
- Phase 2+: sign in as each role (owner, acquisitions, dispositions) with test accounts and try to read data that role shouldn't see.
- Phase 2+: confirm the app's config contains only the publishable key, never the secret/service-role key.
- Phase 3+: confirm logs contain no tokens, phone numbers, addresses, or message bodies.

## Limitations

The Phase 1 guardrails are text scans. They catch accidents, not someone deliberately hiding a write call (e.g. building a method name from pieces). Code review remains a control in its own right.
