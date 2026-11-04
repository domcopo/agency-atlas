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

## Phase 4 — AI briefings and suggestions, read-only (needs approval)

**Scope**
- A **"Get today's briefing"** button. The server sends the AI a trimmed snapshot:
  client list, health scores, check-ins, follow-ups, Atlas asks answers and (after
  Phase 3) GHL metadata. No passwords, keys or tokens are ever included.
- The AI has **no tools at all**, so it cannot do anything except write text back.
  The reply must follow a fixed format: priorities for today, risks, upsell ideas,
  questions to ask, and **draft messages** (copy button only; the app never sends).
- Every suggestion must point at the records it's based on, so you can check it.
- Text from GHL or clients is marked as untrusted data in the prompt. If a message
  says "ignore your instructions", the worst case is a bad suggestion you can see and
  ignore. It can't make the app do anything.
- Briefings are saved (read-only history) so you can compare week to week.
- Later in this phase: Atlas asks can use AI to choose better questions.

**What the owner does**
1. Create an account at console.anthropic.com, add a payment method and a few dollars
   of credit, and set a **monthly spend limit** (for example $30).
2. Create an API key and add `ANTHROPIC_API_KEY=...` to `.env.local`.

**Cost estimate** (Claude Opus 5.5: $4 per million tokens in, $20 per million out;
a token is a word-piece, and 1 million tokens is about 750,000 words):
- One daily briefing for ~35 clients: about **$0.20–$0.40** each, so **$6–$12/month**.
- Draft messages on demand: a few cents each.
- Expected total: **about $10–$25/month**. A cheaper model (Claude Sonnet 5.5, half the
  price) is an option if quality holds; we can measure both.

**Done means**: the briefing appears on Home with sources; drafts copy correctly;
tests prove the AI request has no tools and no secrets; the spend limit is set.

---

## Phase 5 — Hosting + phone access (needs approval)

So the team can use it on their phones, and so syncs/briefings can run automatically
each morning.

- Host the app on a service with HTTPS (for example Vercel Pro, about $20/month; its
  free plan doesn't allow business use). Keys move into the host's secret settings.
- **Upgrade Supabase to Pro ($25/month)** for daily backups before the team relies on
  it. (Reminder requested by the owner.)
- Add team members (managers first), each with two-factor.
- Morning job: GHL sync, then the AI briefing, ready when you open the app.
- Release checklist: secrets, access rules, backups, monitoring, error alerts, rollback.

**Expected running cost after Phase 5**: about $45/month hosting + database, plus
$10–$25/month AI.
