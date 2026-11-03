# Agency Atlas

An internal, phone-friendly command center for a small marketing agency (SEO, ads, website builds): client roster and revenue tiers, sales follow-ups, work oversight, case studies, and a Data Safety center.

> **Status: Phase 1 prototype.** The app has no database, no sign-in, no GoHighLevel connection, and makes no network calls.
> - **Your real client list and team roles** are loaded from a private file on this Mac (`private-data/`, never committed to Git). The banner then reads **"REAL CLIENT LIST · THIS MAC ONLY"**.
> - **Everything else is sample data**, clearly labeled, and never attached to a real client or team member.
> - If `private-data/` is missing (tests, another computer), the app shows a fictional demo roster instead.

## Screens

Bottom tabs: **Home · Clients · Sales · Work · Growth**. The shield icon on Home opens Data Safety.

| Path | What it shows | Data |
|---|---|---|
| `/` | Home: 2×2 tiles (client results, case studies, follow-ups, conversations); top follow-ups (red = overdue, gold = hot, A–D grades with reasons); alerts; recent activity | Real roster summary + sample |
| `/clients`, `/clients/[id]` | Client roster by tier ($500+ high, $150–499 mid, under $150 low, paused, canceled/expired), search, "needs check" filter, client detail | **Real** |
| `/sales`, `/sales/[id]` | Clients signed per month (from real start dates), agency sales KPIs, prospect pipeline, conversations | Real sign-ups + sample |
| `/work`, `/work/[id]` | Oversight view (GoHighLevel stays the actual work queue): work orders, developer load and bonus progress, team roles, escalation path, daily order, priorities | Sample orders + real rules and roles |
| `/growth` | Trends, insights, and how case studies become real | Sample |
| `/growth/dex`, `/growth/dex/[id]` | Business Dex as case studies: 12-month history (revenue as an index, not dollars), survey answers | Sample |
| `/growth/surveys` | Your 20-question survey bank with copy buttons; consent question first. The app never sends surveys. | Real questions |
| `/safety` | Data mode, connections, retention plan, safety checklist | Real status |

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

`npm run dev:phone` makes the app visible to devices on the same Wi-Fi. **It refuses to start while `private-data/` holds your real client list**, because the app has no sign-in yet and anyone on the network could see it. Phone access returns once sign-in exists (Phase 2). Until then, use `npm run dev` on this Mac.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the app on this computer only (port 3200) |
| `npm run dev:phone` | Start on your local network (blocked while real data exists) |
| `npm run lint` | Check code style and common mistakes |
| `npm run typecheck` | Check TypeScript types |
| `npm test` | Run the fixture and guardrail tests (including the real-name leak test) |
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
| [docs/PRIVACY_CHECKLIST.md](docs/PRIVACY_CHECKLIST.md) | Privacy items for human review |
| [docs/SECURITY_TEST_PLAN.md](docs/SECURITY_TEST_PLAN.md) | Security tests, active and planned |
