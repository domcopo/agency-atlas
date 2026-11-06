# Atlas "Agency Operating System" plan (2026-11-05)

The owner's brief asks to turn Agency Atlas into a full agency operating system:
8 specialist areas, an Atlas copilot, a campaign library, new screens, reports and
11 integrations. This file records what exists, what's missing, where the brief
runs into the app's safety rules, and a phased order. **Each phase still needs the
owner's approval before it starts** (CLAUDE.md rule 8). Phase A, slice 1 below is
the only part built so far.

Integration notes below are from memory, **not yet checked against today's
official documentation.** Each integration phase starts by checking the current
docs, scopes, quotas and costs.

---

## 1. What the app is today

- **Stack:** Next.js 16 (App Router, server components and server actions), TypeScript,
  Tailwind, hosted on Vercel Pro (Portland), with a Supabase Pro database (Oregon).
- **Sign-in:** Supabase Auth with two-factor on every table. Three roles:
  - **owner** has full access;
  - **manager** reads everything and edits app data;
  - **developer** sees only their own items, through the `my_work` view.
- **Where data comes from:**
  - the client list (33 clients) and team (7) live in Supabase;
  - GoHighLevel is read-only and copied by an owner-only Sync: pipeline, appointments, and call/message times;
  - nothing else is connected.
- **AI:** Claude Opus 5.5, in one server file. It is text only, has no tools, works on coded client names, and has a hard monthly budget ($10).
- **Rules engine:** `src/lib/ops.ts` holds pure, tested functions for health words, flags, priorities, My Work, team load and opportunities.

## 2. What already covers the brief

| Brief asks for | Already in the app |
|---|---|
| Mission Control, AI briefing, priorities | Home: tabs, Client Detection, Today's priorities, ranked AI briefing |
| Client health + risk | Health word with reasons; 0–100 score on client page |
| Communication tracking | Logged contacts + GoHighLevel call/message **times**; reply-waiting flags |
| Work orders / tasks | `actions` table: follow-ups + issues, owner, priority, status, due date, history |
| Team workload | Work tab: My Work, team load, done in 7 days |
| Sales follow-up | GoHighLevel pipeline copy, lead follow-ups, "new leads with no follow-up" |
| Growth | Upsell/referral opportunities from plain rules, "Make it a next action" |
| Plans / retainers | Services + monthly amount per client |
| Permissions shown in UI | Data Safety screen; role notices |

## 3. What's missing (grouped)

1. **Unified numbers and scores:**
   - one health score that uses *all* the facts: today the 0–100 score ignores issues and GoHighLevel reply waiting, so it can disagree with the health word;
   - top-line Mission Control numbers;
   - a priority score.
2. **Work management views:** a Kanban board, a deadline calendar, project stages and recurring deliverables.
3. **Marketing data:** Search Console, GA4, PageSpeed, Clarity, Google Ads, Meta Ads and Business Profile. None are connected.
4. **Atlas copilot:** ask questions in plain English, with answers that cite records.
5. **Campaign library:** templates as copy-only playbooks.
6. **Reports:** period comparisons, history snapshots and monthly client reports.
7. **Money:** collected and invoiced revenue. The app has **no payment data**; "MRR" is the agreed plan amount from your client list.

## 4. Where the brief conflicts with the current rules (needs a decision)

| Brief item | Current rule | Safer path proposed |
|---|---|---|
| Atlas uses "tool-based querying" | AI gets **no tools** (rule 5, Phase 4) | **Option A (recommended first):** the server works out the question type and fetches the right facts itself, then the AI only writes text. **Option B (later):** a fixed list of *read-only* lookup tools that run as the signed-in user (database rules still apply). Each is a separate approval. |
| Detect complaints/promises in client conversations | App reads call/message **times only**; never message text (guardrail test) | Needs a privacy plan first: which messages, how long they're kept, who sees them, coded names before AI. Separate approval. |
| Revenue: collected, invoiced, unpaid invoices | No payment access in GoHighLevel | Add a read-only payments/invoices scope **or** an accounting connection (QuickBooks/Stripe), later phase. Until then: plan amounts, clearly labeled "not payments". |
| Real heatmaps / session data | — | Microsoft Clarity's export API gives summary numbers only (recent days, small daily limit). Heatmaps stay **links into Clarity**, never drawn by the app. |
| Send messages, enroll contacts, change ads | Forbidden (rules 1, 5) | Stays forbidden. Drafts are copy-only. A future "approval-based actions" design is documented, not built. |
| AI budget $10/month | Hard cap | A copilot used daily by 3+ people will likely need $30–60/month. Owner decides; the cap stays enforced. |

## 5. Proposed database changes (each phase gets its own migration + break-in tests)

- **A:** none for slice 1. Slice 2: `actions.stage` (projects), `recurring_deliverables`, `alerts` (dismiss/snooze state, insert-only history).
- **B:** `integrations` (per client, per provider: status, last sync, error; **no tokens in readable columns**), `integration_secrets` (encrypted with a key that lives only in Vercel settings, readable only by the server), `sync_log`, `seo_daily`, `site_audits`, `ad_daily`.
- **C:** `campaign_templates`, `report_snapshots` (monthly numbers kept so comparisons work), `ai_findings` (with source links and confidence).
- Every new table: owner/manager rules, developer exclusion, two-factor rule, no deletes, and tests.

## 6. Integration requirements (to verify at the start of each phase)

| Integration | Access | Cost | Effort / blockers |
|---|---|---|---|
| PageSpeed Insights | Free API key | Free | Easiest. Good first integration. |
| Search Console + GA4 | Google OAuth, read-only scopes; you add the agency Google account to each client property | Free | Needs a Google Cloud project + consent screen. Medium. |
| Business Profile | Google OAuth + **access application** to Google | Free | Approval can take weeks. |
| Google Ads | OAuth + **developer token** (application, Basic access) via your MCC | Free | Approval wait; read-only reporting only. |
| Meta Ads | Business system user token, `ads_read` | Free | Needs Business Manager access to each client ad account. |
| Microsoft Clarity | Per-project export token | Free | Summary numbers only; heatmaps = links. |
| Rank tracking | e.g. DataForSEO (pay per request) | ~$5–30/mo at your size | Optional. |
| Accounting | QuickBooks / Stripe read-only | Free–low | Optional; decides real revenue. |
| Uptime | e.g. a free uptime monitor's read API | Free | Optional. |

All credentials stay server-side and are stored encrypted, never shown in the browser or in chat.

## 7. Security concerns to keep in view

- **OAuth refresh tokens are long-lived keys to client accounts.** Encrypt them at rest, restrict them to the server, and give the owner a "disconnect" button. Rotate them if exposed.
- **Prompt injection from client websites, messages and search queries:** that text is data. It is never instructions and never decides what the app or AI does.
- **Cross-client leakage in Atlas:** each question gets only the facts it needs. Names are coded, and there is no bulk history.
- **More data means more privacy duty.** Client analytics and messages are client data. Check the privacy checklist before each phase.

## 8a. Owner's priority order (2026-11-05), which replaces the order in section 8

| # | Module | Next build | Needs from owner |
|---|---|---|---|
| 1 | **Client Health + Risk Detection** | Daily score history, so the app can say "dropped 15 points this week". Risk alerts with evidence, links to the records, and a confidence label (fact vs. AI guess). | Run one SQL file (0009) |
| 2 | **Work Order Intelligence** | A **Blocked** status with "blocked by" and "promised to client by" dates. An overdue-and-blocked view and a deadline list. | Same SQL file (0009) |
| 5 | **Atlas Daily Briefing** | The ranked list is built by code from modules 1–4 (score drops, blocked or overdue promises, site problems); the AI only writes the summary. | Nothing |
| 3 | **SEO + Website Audit Center** | A website address field per client. A PageSpeed check (mobile speed, Core Web Vitals) and a basic page check (SSL, title, description, H1, broken links on the page), with saved history and a site health score. | Free Google PageSpeed API key; approve a second network module |
| 4 | **Ads Performance Monitor** | A read-only adapter plus a "connection required" screen now. Real spend and drop alerts once access is granted. | Apply for a Google Ads API developer token (your manager account); Meta system user with `ads_read` |

Detecting complaints and promises from **message text** stays a separate decision (privacy plan first). Until then, promises are entered by people.

## 8. Phased plan

**Phase A: core agency intelligence (no new outside services)**
- **Slice 1 (built 2026-11-05):**
  - one 0–100 health score built from the same facts as the health word, with each point explained and its source;
  - Mission Control's top numbers (plan MRR, active clients, new deals this month, pipeline value, overdue items, at-risk clients);
  - a Kanban board on Work (Open, In progress, Waiting, Done) using the existing items.
- **Slice 2:**
  - Needs Attention items with severity, evidence, time detected and a priority score;
  - dismiss/snooze;
  - a deadline calendar;
  - project stages;
  - recurring deliverables (one migration).
- **Slice 3:** Atlas "Ask" (Option A above) with citations and a "not enough data" answer.

**Phase B: marketing data.**
- PageSpeed first, then Search Console and GA4, then a website health score with history.
- After that, Clarity summaries, then Google Ads and Meta Ads, read-only.

**Phase C: campaigns, reports and growth.**
- A campaign library of copy-only playbooks with manual GoHighLevel setup steps.
- Monthly snapshots and comparisons.
- Client monthly reports, with AI writing the narrative and numbers calculated by code.
- Service profitability once labor and cost estimates are entered.

**Phase D: advanced.**
- Anomaly detection over stored history, and predictive risk.
- Benchmarks across clients, shown only in aggregate.
- An approval-based external-actions design, which needs write access and a separate, explicit decision.
