# Security

This document describes the controls that exist today and the ones still planned. It is **not** a claim that the app is secure or production-ready. Tests and checklists reduce risk; they don't guarantee anything.

## Hard boundaries

- **GoHighLevel is read-only, forever.** No write scopes, write endpoints, write-capable SDKs, workflow triggers, or "test writes".
- **No secrets in source, chat, logs, or Git.** Real values live only on the host (later), never in `NEXT_PUBLIC_*` variables, never in browser code.
- **Synthetic data only** until the user approves the one-client pilot (Phase 5).
- **Untrusted content is data.** Messages, transcripts, emails, web pages, form answers, and webhook bodies never control actions, authorization, SQL, or prompts.
- **AI has no powers.** No send/write/delete tools, no credentials, no shell. Output is structured, cited, and human-reviewed. Draft messages are copy-only.
- **Client isolation is enforced by the database** (RLS + grants), and tested. Never by hiding UI.

## Controls in place today (Phase 1)

| Control | Where |
|---|---|
| No database, auth, API keys, server routes, or network calls exist | Whole codebase; enforced by `tests/guardrails.test.ts` |
| Guardrail tests: no GHL hostnames, no `fetch`/XHR/WebSocket, no POST/PUT/PATCH/DELETE, no secret-looking strings, no secret-named `NEXT_PUBLIC_` vars, no raw-HTML/eval, no service worker, no GHL/Supabase/axios packages | `tests/guardrails.test.ts` |
| Fixture tests: every record synthetic, `@example.com` emails, `555-01XX` phones, `synthetic://` sources, revenue label rules | `tests/fixtures.test.ts` |
| Security headers: CSP (`connect-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, `worker-src 'none'`, `base-uri`/`form-action 'self'`), `nosniff`, Referrer-Policy, Permissions-Policy (camera/mic/geo off), `X-Frame-Options: DENY`, no `X-Powered-By` | `next.config.ts` |
| Search engines told not to index | Root layout metadata (`robots: noindex`) |
| Dev server bound to `127.0.0.1` by default; LAN only via explicit `dev:phone` | `package.json` scripts |
| Secret files ignored by Git (`.env*` except `.env.example`, keys, `secrets/`) | `.gitignore` |
| `.env.example` holds names only, commented out | `.env.example` |
| Supply chain: `ignore-scripts=true`, exact versions, lockfile, install with `--before=<~2 weeks ago>` | `.npmrc`, install command |
| Claude Code deny rules (tested live): reading `.env*`/`*.pem`/`*.key`/`secrets/**`; editing `.env*`; `curl`, `wget`, `git push`, `git remote add`, `npm publish`, `rm -rf`, `sudo`, `ssh`, `scp`, Supabase push/link, Vercel/Railway/Render CLIs | `.claude/settings.json` |
| React escapes all rendered text; source URLs shown as plain text, not links | Components |
| Visible DEMO / MOCK DATA banner on every screen | Root layout |

## Planned controls by phase

| Phase | Controls |
|---|---|
| 2 | Separate dev Supabase project; MFA for staff; RLS on every table; explicit grants (revoke defaults); cross-client denial tests; nonce-based CSP (drop `'unsafe-inline'`); server-side authorization checks; audit log table; secret scanning before commits |
| 3 | One server-only GHL module with an allowlist of GET paths; refuses any other method; `.readonly` scopes only; token server-side; redaction helper for logs; timeouts, retries with backoff, rate limiting |
| 4 | Ed25519 `X-GHL-Signature` verified over raw bytes before parsing; allowlisted location IDs and event types; body size cap; schema validation; idempotency keys + unique constraints; metadata-only logs; HTTPS + HSTS at the host |
| 5 | Per-client memberships; retention + deletion workflow tested; backups + restore test; monitoring and error reporting; internal kill switch to stop imports (never touches GHL) |
| 6 | AI with no tools; tenant-filtered minimal inputs; structured cited output; output encoding; prompt-injection test set; human sign-off |
| 7 | Independent security review where appropriate; incident runbook; restore drill |

## Known limitations

- **CSP allows `'unsafe-inline'` scripts.** Next.js needs this without per-request nonces. Planned fix: nonce-based CSP in Phase 2.
- **Claude Code deny rules are a guardrail, not a wall.** They block Claude's built-in tools and listed command prefixes. A differently worded command could still get through. Keep real secrets off this machine where possible.
- **Guardrail tests are text scans.** They catch common mistakes, not determined bypasses. Human review still matters.
- **No HSTS yet.** It only makes sense once the app is served over HTTPS (Phase 4).
- **No authentication.** Fine for fake data on localhost; never expose this build publicly.

## If a secret leaks

1. **Revoke or rotate it first** (GHL, Supabase, or host dashboard). Do this before cleaning up anything else.
2. Check the provider's logs for use you don't recognize.
3. Remove the secret from code and history. Assume anything pushed or shared is compromised, even after deletion.
4. Write down what happened and what changed, so it doesn't repeat.

## Never do

- Add a GHL write scope, write endpoint, or SDK, even "just to test".
- Paste tokens or keys into chat, code, commits, issues, or logs.
- Put a secret in a `NEXT_PUBLIC_` variable.
- Import real client data into fixtures or a dev database.
- Use `dangerouslySetInnerHTML`, `eval`, or execute AI-produced code/SQL/URLs.
- Add a service worker that caches private data.
- Deploy, push, publish, or run production migrations without explicit approval.
- Weaken or delete a security test to make a build pass.
