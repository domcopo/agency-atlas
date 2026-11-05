# Agency Atlas roadmap (from Phase 2 onward)

Plain-English plan. Each phase starts only after the owner approves it.

The rule that shapes everything: **Agency Atlas only reads.** It never writes to
GoHighLevel, and the AI never gets any power to change, send or delete anything.
The only things that ever change data are buttons a person presses in this app
(check-ins, Atlas asks answers), and they change only this app's own database.

```
GoHighLevel ──(read-only key, GET requests only)──► sync on the server
                                                        │
                                                        ▼
                                             Supabase (your database)
                                                        │  trimmed slice, no secrets
                                                        ▼
                                          AI (no tools, can only write text)
                                                        │
                                                        ▼
                              Briefing + suggestions + copy-only draft messages
                                    on screen, for a person to review
```

---

## Phase 2 — Database + sign-in ✅ (finishing)

Done: your own Supabase project, sign-in, security rules with break-in tests,
real client list imported, private file removed from this Mac.

Left for the owner: **turn on two-factor** (setup guide step 7). Built and tested
locally (43 database break-in checks); the owner still has to set it up and run
`0002_require_two_factor.sql`.

---

## Phase 3 — GoHighLevel, read-only (approved 2026-11-04, built)

**Scope**
- Start with ONE location: the agency's own sub-account (your sales pipeline).
  Client sub-accounts come later, one at a time.
- A Private Integration token created in that sub-account with **only `.readonly`
  scopes**: opportunities, calendars, calendars/events, locations. No contacts, no
  conversations and no message text in this first version (stages, values, dates only).
- One small server-only module (`src/lib/ghl/`) that can only send GET requests to a
  fixed list of addresses. Tests fail if any other method or address appears.
- A **"Sync from GoHighLevel"** button (owner only) copies the read results into new
  Supabase tables with the same security rules + two-factor requirement.
- Sales shows the live pipeline from the synced copy. (Home radar and AI use it next.)

**What the owner does**
1. In GoHighLevel, in the agency's own sub-account: **Settings → Private Integrations →
   Create new integration**. Name it "Agency Atlas (read-only)". Tick only the
   `.readonly` scopes listed above. Copy the token.
2. Add two lines to `.env.local` (same way as the Supabase lines):
   `GHL_READONLY_TOKEN=...` and `GHL_LOCATION_ID=...` (the sub-account ID, shown in
   Settings → Business Profile).
3. Run one new SQL file in the Supabase SQL Editor (new tables + rules).

**Risks and how they're handled**
- *A token with too many powers*: you pick read-only scopes; the code also refuses
  anything but GET; tests check both. If a token is ever exposed, delete it in GHL.
- *Private client data in a new place*: only metadata is copied, same database rules,
  two-factor required.
- *GHL rate limits*: manual sync, small pages, no background loops.

**Done means**: one sync brings in real leads/opportunities/appointments for the
agency sub-account; numbers on Sales match GHL; all tests pass; nothing in GHL changed.

**Cost**: $0 (included in your GHL plan).

---

## Phase 4 — AI assistant with a hard $10/month budget (approved 2026-11-04 with Claude Opus 5.5, built)

**The idea in one line:** the AI reads a trimmed copy of your data, writes suggestions
and drafts for a person to review, and can never change, send or delete anything.
Every request is counted, priced and stopped at your budget.

### 4a. AI spend meter + budget (built first, before any AI feature)
- A **meter** on Data Safety (and a small chip on Home): tokens used this month,
  cost this month, and a bar toward the budget (default **$10/month**).
- **Alerts:** the meter glows amber at **50%**, red at **80%** with a banner on Home.
- **Hard stop at 100%:** the app refuses new AI requests until the 1st of next month
  (or until the owner raises the budget). Before each request it also checks that the
  worst-case cost of that one request still fits.
- Every request is logged: date, feature, model, tokens in/out, cost. Owner and
  managers can see the log; nobody can edit or delete it.
- **Second lock:** you also set a $10 monthly spend limit in the Anthropic Console, so
  the provider itself stops billing past $10 even if the app had a bug.

### 4b. What the AI does (all read-only, no tools)
1. **Daily briefing** (button on Home): today's priorities, at-risk clients, check-ins
   due, upsell ideas, and questions to ask, each pointing at the records it's based on.
2. **Client knowledge profiles:** one page per client that the AI drafts from check-in
   notes and moods, Atlas asks answers, services, health and (after Phase 3) pipeline
   and appointments: what they buy, how they're doing, what they care about, open
   risks, next best step. Saved as **"AI draft"** until you mark it reviewed. This
   becomes your client knowledge base and gets better as the team logs check-ins.
3. **Draft messages** for check-ins and win-backs: copy button only. The app never
   sends anything.
4. **Team coaching (weekly):** patterns worth fixing, such as overdue check-ins,
   clients trending worse, no-shows, and new clients in their first 60 days. Overseeing
   developers' work comes once work orders are real (they're still samples).

### How it stays safe
- One server-only module (`src/lib/ai/`) is the only code that talks to the AI. It
  sends **no tools**, so the AI can only return text. Tests check this, and check that
  no other file contacts the AI.
- **Names are swapped for codes** ("Client 7") before anything leaves this Mac; the
  app swaps them back on screen. Notes are sent as written, so avoid putting
  sensitive personal details in check-in notes.
- Data from clients and GoHighLevel is marked as untrusted in the prompt. Instructions
  hidden in it can at worst produce a bad suggestion you can see and ignore.
- Answers must follow a fixed format and are shown as plain text.
- Privacy note for review: client data goes to Anthropic's API, which by default doesn't
  train on API data and keeps it for a limited time (check their current policy).

### What the owner does
1. Create an account at console.anthropic.com, add a payment method and $10 of credit.
2. **Settings → Limits:** set the monthly spend limit to **$10**.
3. Create an API key and add `ANTHROPIC_API_KEY=...` to `.env.local` (Claude never sees it).
4. Approve one new package: Anthropic's official SDK (`@anthropic-ai/sdk`).

### Cost inside a $10 budget (estimates, measured once it runs)
| Model | Price per million tokens (in / out) | Daily briefing (weekdays) | Profiles + drafts | Month |
|---|---|---|---|---|
| Claude Opus 5.5 (most capable) | $4 / $20 | about $5 | about $3 | **about $8** (close to the cap) |
| Claude Sonnet 5.5 | $2 / $10 | about $2.50 | about $1.50 | **about $4** |

The meter shows real numbers after the first week, so the model can be changed later.

**Done means:** the meter shows exact usage; the hard stop blocks at the budget (tested
with a tiny test budget); the briefing, profiles and drafts work with sources; tests
prove the AI gets no tools and no secrets.

---

## Phase 5 — Hosting + phone access (approved 2026-11-04, setup: PHASE5_SETUP.md)

So the team can use it on their phones, and so syncs/briefings can run automatically
each morning.

- Host the app on a service with HTTPS (for example Vercel Pro, about $20/month; its
  free plan doesn't allow business use). Keys move into the host's secret settings.
- **Upgrade Supabase to Pro ($25/month)** for daily backups before the team relies on
  it. (Reminder requested by the owner.)
- **Add team logins** (postponed until hosting, at the owner's request): four team
  members, managers first, each with two-factor. Steps: `docs/TEAM_ACCESS.md`.
- Morning job: GHL sync, then the AI briefing, ready when you open the app.
- Release checklist: secrets, access rules, backups, monitoring, error alerts, rollback.

**Expected running cost after Phase 5**: about $45/month hosting + database, plus
the AI budget you set (default $10/month).
