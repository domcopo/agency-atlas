# Agency Atlas

An internal, phone-friendly command center for the agency: KPIs, client health, a research "Business Dex", insights, and a Data Safety center.

> **Status: Phase 1 — DEMO / MOCK DATA.** Everything you see is fake. The app has no database, no sign-in, no GoHighLevel connection, and makes no network calls.

## Screens

| Path | Screen | What it shows |
|---|---|---|
| `/` | Mission Control | KPI tiles, alerts, follow-up priorities, recent activity |
| `/clients` | Clients | Client list with health scores |
| `/clients/[id]` | Client profile | Metrics, goals, blockers, notes, "what changed" |
| `/dex` | Business Dex | Searchable trading-card index of businesses + shared patterns |
| `/dex/[id]` | Dex record | Revenue (with label + source), signals, hypotheses, sources |
| `/insights` | Insights | Mock "AI" observations — hand-written, clearly labeled |
| `/safety` | Data Safety | Data mode, connections, retention plan, safety checklist |

## Prerequisites

- **Node.js LTS** — download the installer from [nodejs.org](https://nodejs.org). Check with `node -v`.

## Setup

```bash
npm install --before=2026-10-18
```

`--before` only installs package versions that were already public on that date. Brand-new releases are where most supply-chain attacks hide, so waiting ~2 weeks is a cheap safety net. `.npmrc` also blocks packages from running install scripts and pins exact versions.

```bash
npm run dev
```

Open http://127.0.0.1:3200 (or http://localhost:3200). This only works on this computer. Port 3200 is used because other local apps on this Mac use 3000 and 3100.

### Viewing on your phone

```bash
npm run dev:phone
```

This makes the app visible to devices on the same Wi-Fi. Open the "Network" address it prints on your phone. Only do this with mock data and on a network you trust. Stop it when you're done.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the app on this computer only |
| `npm run dev:phone` | Start the app on your local network |
| `npm run lint` | Check code style and common mistakes |
| `npm run typecheck` | Check TypeScript types |
| `npm test` | Run the fixture and guardrail tests |
| `npm run build` | Production build (catches build-time errors) |
| `npm run check` | All of the above |

## Docs

| File | Read it for |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Rules every AI coding session must follow |
| [ARCHITECTURE.md](ARCHITECTURE.md) | How the pieces fit, now and later |
| [SECURITY.md](SECURITY.md) | Hard boundaries, current controls, known gaps |
| [DATA_DICTIONARY.md](DATA_DICTIONARY.md) | Record shapes today + proposed database tables |
| [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) | What could go wrong and how we prevent it |
| [docs/PRIVACY_CHECKLIST.md](docs/PRIVACY_CHECKLIST.md) | Must-do list before any real client data |
| [docs/SECURITY_TEST_PLAN.md](docs/SECURITY_TEST_PLAN.md) | Security tests, active and planned |
