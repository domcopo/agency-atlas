# Client care plan

**Status (2026-11-24):** Steps 1A (`0025`) and 1B (`0028`) are built, merged and run on the live database. **Step 1D was approved and BUILT on 2026-11-24 (`0031_care_goals.sql` not run yet; Google Ads audits took 0029 and BizToad 0030).** Step 1C (VA logins) has not started.
**Branch:** `claude/client-care-53178d` (own worktree). **Migration order** (owner, 2026-11-24): 0024 Scout, 0025 client care, 0026 sales leaderboard, 0027 SEO Watcher, 0028 client journey. 0029 Google Ads audits, 0030 BizToad, 0031 care goals (Step 1D); next free 0032.

## Step 1C (approved and BUILT 2026-11-24; `0033_va_role.sql` not run yet): VA logins

As built:
- **Role:** `canCare(role)` = owner, manager or va (`src/lib/roles.ts`). It gates the Clients screens and the care actions. VAs use nav mode `va` (Home, Clients, Kit), their own Home branch, and Data Safety is blocked.
- **VA requests:** `requestStatusChange` / `decideVaRequest`, shown by `VaRequests` on Home and the client page's Status card ("Ask a manager").
- **Kit:** pages can be marked "VAs".
- **Deferred:** "Draft with AI" for VAs. A safe per-person AI spending cap is needed first (like BizToad's), so VAs copy the regular template for now.
- **Tests:** RLS section 7cb, plus guardrails for the VA tabs, the Data Safety block, and client pages that stay closed to sales and developers.

**Why:** today a VA can sign in only as a *manager*. Managers also see work orders and developer workload, Sales and leads, Growth, Trash and the AI buttons, and they can pause or mark clients lost. A **VA** role gives VAs exactly what client care needs, enforced by the database rather than by hidden buttons.

**Owner decisions (2026-11-24):**
- VAs see **all clients**, never prices or billing.
- VAs see each client's **follow-ups and issues, read-only**.
- **Serious changes need a manager's OK first.** A VA can *ask* to pause or mark a client lost, and an owner or manager approves or turns it down. Small things they do directly.

**What a VA can do directly:**
- Log journey touches (talked, no answer, text, email) and check-ins with mood.
- Tick week-1 intake items, set "No texts", preferred channel and best times.
- Edit client memory (goal, tone, next ask). These are short notes, and every change shows in the client's history.
- Press **Needs the owner**.
- Use **Draft with AI** on Next move. It costs a little from your AI budget, inside the same monthly cap. "Suggested next moves" stays for the owner and managers.
- See their own **daily goal**, which the owner sets on Restart journeys · goals.

**What a VA asks for (a manager or the owner approves):**
- **Pause, mark lost or bring back a client.** The VA fills in the same form (reason required), and it becomes a request.
  - Owners and managers see "VA requests" on their Home and on that client's page, with **Approve** and **Turn down**.
  - Approving makes the change as the approver, with the same status log and notices as today.
  - The VA sees whether it was approved.

**What a VA never sees or does:**
- Prices, billing, Work and work orders, Sales and leads, Audits, Scout, Growth, Data Safety, Trash, Plan tiers, Set up clients, Restart journeys, Add client.
- Other people's settings, the AI briefing, "Suggested next moves".
- Changing follow-ups or issues, moving anything to Trash, deleting anything.

**Screens for a VA:** Home (the Client care view: touches due, needs attention, replies waiting, today's goal), Clients (list, board, client pages without owner and manager tools), and Kit (playbook and templates). Every other screen shows the usual "not part of your view" notice.

**Adding a VA:** the same 3-minute steps in `docs/TEAM_ACCESS.md`, with role `va`. That guide gets a VA row and a one-line switch from manager to VA:
```sql
update public.team_members set role = 'va' where display_name = 'Their name';
```

**Database change `0033_va_role.sql`** (next free number):
- **The role:** `team_members` accepts `va`.
- **Read rules for `va`:** clients (same columns as managers, so never amounts), plan tiers, staff names, check-ins, journey touches, contact preferences and intake, escalations, GoHighLevel call and message **times**, follow-ups and issues (read-only), the client's history, and Kit pages marked for VAs (the playbook and templates get a VA audience).
- **Write rules for `va`:** add check-ins, touches, intake and contact rows, escalations and history lines, always as themselves. Edit only the memory columns on a client (the client guard allows nothing else).
- **`va_requests`:** client, what's asked (pause / lost / back), reason, note, who asked, status (waiting / approved / turned down), who decided and when.
  - VAs add their own requests and read only their own.
  - Owners and managers read all requests and decide on them.
  - Nobody deletes a request.
  - A notice tells owners and managers when a request comes in, and tells the VA when it's decided.
- **AI:** the budget check accepts VAs for drafts only. The cost log already records who ran what.
- **Break-in tests:** a VA reads none of client amounts, billing, work orders, leads, audits, Scout, AI briefings, settings, Trash or other people's requests. A VA can't change a client's status or plan, can't change follow-ups, can't approve requests, and can't act as someone else. Plus the usual two-factor and signed-out checks.

**Risks:** this is the biggest security change in client care, because a new kind of person gets client data. The database rules and about 50 break-in tests are the real lock. Before giving a VA real access, the owner can try it with a test VA login.

**Done means:**
- A test VA login sees only Home, Clients and Kit.
- It can log touches, intake and memory, and can ask to pause a client.
- A manager approves the request, and the status log shows it.
- Every forbidden screen and table is refused (proven by the break-in tests).
- All tests, RLS tests and the build pass, checked on a phone.

## Step 1B+ (approved and BUILT 2026-11-24; `0032` not run yet): intake, "No texts", "Needs the owner", Kit playbook

The small extras moved out of Step 1B. Database change `0032_client_care_extras.sql` (next free; 0030 BizToad and 0031 care goals are run).

1. **Week-1 intake checklist** on each client page: 10 tick boxes, from the owner's roadmap.
   - The items: final services, real service area, logo and brand, job and team photos (with permission), Google Business Profile access, website/domain/hosting access, email or DNS issues, past ads and keywords, preferred channel and best times, other people to keep in the loop.
   - Atlas stores only "received" and the date. Never logins, files or passwords.
   - While the client is in Kickoff or First results, the Next move card shows "Still need: photos, Google access…", so every touch asks for what's missing.
2. **"No texts" switch** (for when a client replies STOP), plus **preferred channel** and **best times to reach them**, on each client page.
   - With "No texts" on, the Next move card says "Don't text: use email", the Done form starts on Email, and the AI draft is written as an email.
   - Anyone on the care team (owner, managers) can set it. The change is logged in the client's history.
3. **"Needs the owner" button** on each client page (owner and managers).
   - It takes a one-line reason. You get an in-app notice straight away, and it shows at the top of your Home under "Needs you" until you tap Resolved.
   - **Automatic alert:** when someone logs a "worse" mood on a VIP or top-tier client, you get the same notice without anyone pressing the button.
4. **Kit playbook pages**, seeded as normal editable Kit pages (managers can read and edit them):
   - a "Client communication playbook" SOP: house rules, STOP handling, "never invent numbers", "show pages only when they're really done", the baseline heat map first, and calls first;
   - message templates: Day-1 recap, first pages, week-1 check-in, heat map heads-up, survey, referral.

   There are no real names in them; placeholders like [First name] and [Business] are used instead.

**Database (0032):**
- `client_care`: one row per client with no_texts, preferred_channel, best_times and intake items received with dates. Owner and managers read and write; changes are stamped with who and when.
- `care_escalations`: client, reason, who raised it, when, resolved when and by whom. Add-only, except Resolve (owner).
- A trigger sends the owner a "Needs you" notice, both for the button and for a "worse" mood on a VIP or top-tier client. The notice kind is `needs_owner`, and it can be muted like the others.
- The Kit pages are added with the migration, in the same way the Kit's first pages were.
- RLS, the two-factor rule and break-in tests for both tables.

**Done means:**
- The intake ticks save, and missing items show on early touches.
- "No texts" changes the Next move card and the Done form.
- "Needs the owner" and a worse mood on a VIP both reach your notices and your Home; Resolve clears them.
- The Kit shows the playbook and templates, and you can edit them.
- All tests, RLS tests and the build pass.

## Step 1D (built 2026-11-24): restart everyone, journey board, daily goal, AI helper

As built:
- **Restart and goals:** `/clients/restart` (owner) holds the restart preview and confirm (`restartAllJourneys`, `restartSchedule`) and the daily goals (`care_targets`).
- **Logging a touch:** "How did it go?" on Next move (`logTouch`): talked, no answer (stays open; due the next working day), video, text or email.
- **Points:** `CARE_POINTS` / `dayProgress` in `src/lib/journey.ts`.
- **Clients page:** `GrowthLine` and `JourneyBoard` (`?stage=N` filters the list); the owner's setup links are one row; "Check-ins due" became "Touches due" once 0028 runs.
- **Today's goal:** `CareGoalCard` on Clients and on the Client care Home.
- **AI helper:** `SuggestedMoves` (Home) and "Draft with AI" (Next move), as `suggestNextMoves` / `draftTouchMessage` (features `care_suggestions` / `care_draft`). Names become codes, the budget is checked first, and nothing is saved or sent.
- **Not checked with real data or the real AI:** the demo has no database or AI key.

The owner's request: put every client back through month 1 in "an amazing system"; add a small growth line next to "Clients"; give the client communicator a daily goal that moves clients through the stages; review and organise the Clients page; and show where AI helps the communicator.

**Owner decisions (2026-11-24):**
- **Restart:** every active client goes back to touch 1, **4 new kickoffs a day**, biggest, VIP and top tier first. Calls matter most: try to get them on the phone.
- **Daily goal:** 15 touches a day to start, changeable per person.
- **Line graph:** active clients over 12 months.
- **AI helper:** yes, now: suggestions plus drafts.

**1. Restart everyone (owner only).** A "Restart all journeys" button on Plan tiers or Set up clients. It shows a preview first ("22 clients: 4 a day, Nov 25 to Dec 1") and saves nothing until Confirm. It sets each client's journey start to a staggered date. Touches logged before the restart stay in history but no longer count. Nothing is deleted.

**2. Calls first: "No answer" is part of the journey.** On a call touch, Done offers **Talked**, **No answer (left voicemail + text)** or **Text/email instead**.
- **No answer** keeps the touch open, records the attempt, and moves the due date to the next working day. The card says "Attempt 2: call again, or send the report/images by text".
- After 2 tries without an answer, the card suggests finishing the touch by text or email.
- **Points toward the goal:** a real conversation (call or video answered) counts 3, a voicemail + text counts 1, and a text or email counts 1. A day with 3 good calls is worth as much as 9 texts. The goal still reads in plain words: "9 of 15 today · 2 calls connected".

**3. Journey board** at the top of Clients: 6 stage columns with counts (Kickoff 6, First results 5…). Tapping a stage filters the list below to those clients. Under it, one line: "7 touches overdue · 5 due today".

**4. Small growth line** next to the "Clients" title: active clients month by month for 12 months, plus the 3-month change ("+4 in 3 mo"). It's worked out from start and end dates, the same as Clients won and lost. Small on phones, a bit bigger on computers.

**5. Today's goal** on Client care Home and on Clients, for the person signed in: points so far versus their goal, calls connected, and clients moved to a new stage today. The owner sets each person's goal on Set up clients; the default is 15.

**6. AI helper (suggestions only; nothing is sent).**
- **"Suggested next moves"** on Client care Home: up to 5 clients, each with one line on why now and what to lead with. It's built from facts Atlas already has (stage, overdue touch, health, last mood, client memory, tier), with names swapped for codes, through the one AI module, inside the monthly budget, and logged.
- **"Draft with AI"** on each Next move card: it rewrites the template using the client memory (goal, tone, next ask) and what was done recently. The person edits and copies it, then sends it from GoHighLevel.
- Atlas never reads message text from GoHighLevel, so the AI only knows what's logged in Atlas.
- Each suggestion run and each draft shows its cost against the budget, and the owner's existing AI budget cap applies.

**7. Clients page clean-up (same information, better order).**
- **Top:** title + growth line + Add client, then the journey board, then today's goal.
- **Then:** risk alerts, owners and next steps, by service (with tier counts), the client list (with tracks), win-back, and Clients won and lost (folded).
- **"Check-ins due"** is replaced by the journey's touches due, because the two said the same thing.
- **The owner's setup links** (Set up clients, Plan tiers, Match GoHighLevel contacts, Restart journeys) go into one "Setup" row of small buttons.

**Database change `0031_care_goals.sql`** (renumbered twice: Google Ads audits took 0029, BizToad 0030; it keeps BizToad's `ask_toad` AI feature in the cost-log rule):
- `care_touches` gains an `attempt` status and an `outcome` (talked / voicemail / text instead).
- `care_targets`: a daily goal per person (owner sets it; each person reads their own).
- RLS, the two-factor rule and break-in tests, as always.
- The restart itself needs no new table. It only sets `care_started_on`.

**Risks:**
- The restart changes every active client's journey at once. The preview step, the stagger, and keeping every old touch in history keep that safe and reversible: the owner can restart again any time.
- The AI costs money. Each run is checked against the budget first, as today.

**Done means:**
- Restart preview and confirm work.
- No answer reschedules the touch, and connected calls count 3.
- The board filters the list, and the growth line matches Clients won and lost.
- The goal shows on Home.
- The AI suggestions and drafts work within budget, with no real names sent.
- All tests, RLS tests and the build pass, checked at phone and desktop width.

### What Step 1A actually built (differs from the draft below in a few places)

- **Tables:** `care_plans` (tiers; seeded SEO Starter 10 h, Growth with hours blank, Pro 30 h top tier), `client_plans` (one tier per client per service; a composite foreign key stops an Ads tier being used as an SEO plan; "no tier" = `plan_id` null, never deleted), `client_money` (owner-only amounts, copied from `clients.monthly_usd`), plus `clients.vip`, `backup_staff_id`, `care_started_on`.
- **No `care_plan_prices` table.** Each client's real amount lives in `client_money`. The list prices shown to prospects already live in Sales → audit settings, so a second price list would have to be kept in sync by hand. They can be linked later if wanted.
- **The amount column is locked.** Rights on `clients` are now granted column by column, so `monthly_usd` can't be read or written through the app by anyone, including the owner. The app reads amounts only as the owner, from `client_money`. Everyone else's screens show tier names, VIP and counts instead of dollars, and sort by VIP → top tier → tier → amount (`byImportance` in `src/lib/ops.ts`).
- **Add client** (`/clients/new`): name, start date, services, and a tier for each ticked service that has tiers. Optional main person and backup; owner-only amount and VIP. It warns about look-alike names. Website and notes fields were left out (no column for them yet).
- **Owner screens:** `/clients/plans` (tiers: add, edit, archive), `/clients/setup` (main person, backup, services, tier, VIP, amount per row), the same form under "Edit plan" on each client page, and a "By plan tier" card on `/clients/service/seo`.
- **Daily GoHighLevel sync:** runs only when **the owner** opens Home and the last sync is over 24 hours old, because managers can't write GoHighLevel copies. It runs after the page is sent (`after()`), skips billing, and uses the same read-only GETs. It has **not been tried against the live GoHighLevel account**: check the "last sync" time on Data Safety the day after.
- **Tests:** `tests/care.test.ts` (rules and guardrails); `supabase/tests/10_rls_break_in.sql` section 7u. Older tests that read `select *` from `clients` now read named columns, because the locked column makes `*` fail. Their meaning is unchanged.

## What the owner asked for

1. See at a glance which clients are on which **plan**: SEO first; Ads and Website later.
2. A **communication process** for the client communication team: how often, which channel, what to say, how to help, and when to bring in the owner.
3. An **Add client** form, for clients GoHighLevel doesn't bring in.
4. Later, **helper bots**. They only suggest; a person always sends.

## Owner decisions (2026-11-24)

| Topic | Decision |
|---|---|
| SEO plans | Named tiers sold by **hours per month**. Starter = up to 10 h. Pro = up to 30 h (a cap, so the team doesn't go over). Growth sits between; its hours, price and extras are still **to confirm**. |
| What a tier includes | Starter: 10 h of SEO, a competitor analysis before work starts, 1–2 heat maps a month (about every 2 weeks, 2–3 keywords), and 1 SEO report a month. Growth adds a competitor review every quarter. |
| How often clients are contacted | It depends on the tier. Every new client gets a lot of contact at the start (see the 27-touch plan below). |
| Prices | Visible to the owner only. Managers and VAs see plan names and what's included, never prices. The owner left it to us whether managers still see each client's monthly amount. **Recommendation: hide it** (see Step 1A). |
| Add client | The owner and managers can add clients. Only the owner changes price, plan and VIP afterwards. |
| Who talks to each client | One **main** person and one **backup** per client. **VAs** (virtual assistants) can see every client's care history and cover odd hours. Important matters go to the main person. A ranking of who covers when (a hierarchy) comes later. |
| VA logins | **From the start.** That means a new `va` role (Step 1C). |
| Channels | Call, text, email and video. The app **reminds and logs only**; people send from GoHighLevel. |
| Unhappy or at-risk client | The team tries to calm it down first. If that fails, or the client is sensitive or important, it goes to the owner before it gets worse. |
| Important clients | Top-tier clients count automatically, plus a **VIP** switch that only the owner sets. |
| Daily GoHighLevel sync | **Yes**, still read-only. |
| Bots (later) | All four: draft messages, suggest next step, team helper, spot drifting clients. |
| "Giving help" | Ask for reviews and Google Business Profile photos. Ask what we need from them. Check in. Later, spot their growth stage and likely problems, and offer advice (for example, speed-to-lead and answering every call). |
| Playbook source | The owner's 27-touch roadmap (pasted 2026-11-24; drafted with another AI tool). We'll reuse it with no real names and no real towns. |

## How it fits what exists today

- **Clients:** `clients.services` (`SEO`/`Ads`/`Website` ticks), `owner_staff_id` (main person), status. The owner fills these in on `/clients/setup`. Clients only ever came in through the one-time private import, and GoHighLevel sync never creates clients. **So Add client is now the only way to add one.**
- **Check-ins:** each has a kind (call, message, email, meeting, note) and a mood (better, same, worse). Health uses the newest check-in or GoHighLevel call/message time as "last contact".
- **Check-in rhythm:** fixed in code (`CHECK_IN_DAYS`: SEO 30, Ads 14, Website 60). This plan replaces it with the client's tier rhythm.
- **Health and risk:** `src/lib/ops.ts` (rules in `OPS_RULES` / `HEALTH_POINTS`). We reuse it; touches feed into it as normal check-ins.
- **Client care Home** (`clientCareView` in `src/lib/home-layouts.ts`) already lists *my* clients, attention items, replies waiting and promises. This plan adds "Touches due".
- **Kit** already has SOPs, FAQs and templates. The written playbook and message templates go there.
- **Surveys** already exist in Growth. Touch 26 (survey ask) links to them.
- **Desktop layout** (`docs/DESKTOP_LAYOUT_PLAN.md`): new screens use `Columns`/`Column` and `lg:` classes, so phones stay unchanged.

## Phases

SEO comes first. Each step is its own commit, and the owner tests it before the next one starts.

### Phase 1: SEO client care

**Step 1A: plans, Add client, owner-only prices, main/backup/VIP, daily sync**

- **Plan tiers** (`/clients/plans`, owner only). The owner creates tiers per service:
  - name and order (Starter < Growth < Pro);
  - hours per month;
  - what's included (short lines);
  - heat maps per month, report rhythm, mid-month check-in on/off, competitor review every N months (0 = never);
  - "top tier" (counts as important).

  The price sits in a separate owner-only table. We pre-fill Starter (10 h) and Pro (30 h); Growth stays blank until the owner fills it.
- **Each client's plan.** `/clients/setup` gets a tier picker, a backup picker and a VIP switch (owner only). Clients get a plan badge: "SEO · Starter". `/clients/service/SEO` groups clients by tier.
- **Add client** (`/clients/new`, owner and managers):
  - **Required:** name, start date, plan tier.
  - **Optional:** main person, backup, website, notes.
  - **Owner only:** monthly price and VIP.

  Managers can't set price or VIP, and the database blocks it. The form warns when a client with a similar name already exists, so nobody adds the same client twice.
- **Hide prices from managers.**
  - *Why:* VAs are about to get logins, and the database can't hide one column from some people and not others. The clean fix is to move each client's monthly amount into an owner-only table. Managers then see tier and VIP instead of dollars. Sorting "biggest first" becomes "VIP, then top tier, then tier".
  - *How:* the migration copies every amount. We check the counts match before anything else changes. The old column is cleared only in a later, separately approved migration.
- **Daily GoHighLevel sync.** It works like the hourly lead refresh that already exists. When the owner or a manager opens the app and the last sync is more than 24 hours old, the app quietly re-reads the call and message **times** in the background.
  - Same read-only module and the same allowlisted GETs.
  - No timer, no new API route, no cost.
  - If nobody opens the app all day, it runs the next time someone does.

**Step 1B (revised 2026-11-24): status changes + the client journey. BUILT 2026-11-24 (`0028_client_journey.sql` not run yet).**

As built: the 27 touches and the Grow rhythm live in `src/lib/journey.ts` (tested in `tests/journey.test.ts`). The screens are `JourneyCard` (client page: stages, ticks, next move), `NextMoveForm` (Copy, Done, Skip), `ClientStatusForm`, `ClientMemoryForm`, `JourneyMini` on the Clients and service lists, and "Touches due" on the Client care Home. Grow = monthly report, mid-month check-in (if the tier has one), and a quarterly review (competitor review + upsell ideas). Existing clients count from their last contact. RLS section 7v. Not checked with real data: the demo has no database, so the journey only appears once 0028 is run.

Owner decisions (2026-11-24): managers may mark a client lost themselves (the owner gets a notice); 6 stages with 27 ticks; add client memory (goal, tone, next ask); database number `0028`.

The owner asked for two things, with a ChatGPT mock-up as a guide (a "relationship journey" track, a timeline of contacts, a "next move" card and a short "client memory"):

1. **Managers can pause, mark lost, or bring back a client. Nothing is deleted.**
   - On the client page, a **Status** button: Active / Paused / Lost. A reason is required (dropdown: price, results, went in-house, closed or sold, no reply, other) plus an optional note.
   - "Lost" sets the status to canceled with today's end date. The client then moves to "Canceled & expired" on Clients and counts in **Clients won & lost**. Everything about them stays: history, check-ins, work orders, tier, amount.
   - "Bring back" sets them active again and clears the end date.
   - Every change is kept in an add-only log (who, when, from, to, reason). Nobody can edit or delete that log.
   - The owner gets an in-app notice when a manager marks a client lost.
   - Trash and Delete forever stay exactly as they are today: owner only, from Trash.
2. **Client journey.** The 27-touch plan, grouped into 6 stages so it reads at a glance:

   | Stage | Touches | What happens |
   |---|---|---|
   | 1. Kickoff (week 1) | 1–4 | Kickoff call, recap text, first 2 pages (day 2–3), check-in + 2 more pages (day 7) |
   | 2. First results (weeks 2–4) | 5–9 | First heat map (day 14) + text, week-3 nudge, month-1 report + text |
   | 3. Month 2 | 10–18 | Check-in, work plan, 45-day call + recap, mid-month snapshot, review/photo nudge, month-2 report + text, "anything you need" |
   | 4. Month 3 | 19–23 | Check-in, month-3 plan, 60–70-day call + recap, "90-day report coming" heads-up |
   | 5. 90-day wrap | 24–27 | 90-day report + text, survey, referral ask |
   | 6. Grow (ongoing) | repeats | Monthly report, mid-month check-in, competitor review by tier, an upsell review each quarter |

   - **Client page: "Relationship journey" card.** It shows 6 stage dots (done / current / next) with a thin 27-tick bar under them showing each touch.
   - **"Next move" card**, next to the journey. It shows:
     - the next touch, its due date and channel;
     - what to say and what to ask for;
     - a **Copy message** button (from a template; no AI yet, and nothing is ever sent);
     - **Done** (how it went: call, text, email or video; optional note and mood). Done also logs a check-in, so health and "last contact" stay right;
     - **Skip** (a reason is required).
   - **Clients list: a small track on the right of each client.** It shows 6 short lines, with the current stage highlighted and a label, for example "Month 2 · touch 12 due Nov 28" in amber when overdue. The client page mock-up's left-hand list ("Draft ready", "Check-in due", "On track") becomes this same short status.
   - **Home (Client care view): "Touches due"**, today and overdue, for the clients each person is the main person or backup on.
   - **Existing clients** start in stage 6 (Grow), so nobody gets 27 overdue reminders. A **Start onboarding** button (owner and managers) restarts the journey from touch 1 for a new or returning client.
   - **Client memory** (optional; the owner decides): 3 short fields on each client (goal, tone, next ask), shown on the client page. They're useful later, when the bots draft messages.
   - **Changing the touches:** the 27 touches and their wording live in one tested list (`src/lib/care.ts`). An in-app editor comes later (Phase 2).

**Database change: `0028_client_journey.sql`** (next free number; the owner confirms it first):
- `care_touches`: each Done or Skip (client, touch number, done/skipped, date, channel, note, who). Add-only; the owner can fix mistakes. Owner and managers read and write.
- `client_status_changes`: the add-only status log above, plus a trigger that sends the owner a notice for "lost".
- The 0019 client guard is widened: managers may now change `status` and `end_date` (and Trash), still nothing else. Lost always needs a log row with a reason.
- If the owner says yes to client memory: three short columns on `clients` (managers may edit only those).
- RLS, the restrictive two-factor rule and break-in tests for each table, as always.

**Moved to Step 1B+ (later, small):** week-1 intake checklist, "No texts" switch and preferred channel, "Needs the owner" button and VIP alerts, Kit playbook pages. **Step 1C** (VA logins) is unchanged.

**Done means:**
- A manager can pause, mark lost and bring back a client on a phone, and the log shows who and why.
- A lost client shows under "Canceled & expired" and in won & lost, with nothing missing.
- A new client shows touch 1 on day 1. Done moves the journey on and logs a check-in.
- Clients shows the small track on every current client.
- All tests, RLS tests and the build pass, and the screens are checked at phone and desktop width.

**Original Step 1B draft (kept for reference; the revised scope above replaces it):**

- **The 27-touch onboarding plan** lives in `src/lib/care.ts`: a tested list, editable in a later phase. Each touch has a number, its timing (for example "day 1" or "about day 45"), a channel, who does it ("comm" or "comm + SEO"), what it's for, and an optional message template. The steps are those in the owner's roadmap:
  - **Month 1:** kickoff call and recap text, first pages at day 2–3, two more pages at day 7, first heat map at day 14, light nudge in week 3, month-1 report.
  - **Months 2–3:** check-in texts and emails, a call at about day 45 and day 60–70, mid-month snapshots, monthly reports.
  - **Wrap-up:** 90-day report (24), survey (25–26), referral ask (27).
- **Per client.** When a client starts (Add client or "Start onboarding"), the app counts from that date. The client page shows a "Care plan" card:
  - the next touch, with what to say, what to ask for and a **Copy message** button;
  - **Done** (pick how: call, text, email or video; optional note and mood). This also logs a check-in, so health and "last contact" update.
  - **Skip** (a reason is required);
  - a small timeline: 7 of 27 done.
- **Existing clients** don't get 27 overdue touches. They go straight onto their tier's steady rhythm (monthly report plus a mid-month check-in). The owner can still press "Start onboarding" on any client.
- **After day 90,** the tier rhythm takes over: report every month, mid-month check-in if the tier has one, heat map every N weeks, competitor review every N months. It replaces the fixed `CHECK_IN_DAYS` for clients who have a tier.
- **Week-1 intake checklist** on each client. These are the 10 items from the roadmap: services, service area, logo and brand, photos plus permission, Google Business Profile access, website/domain/hosting access, email/DNS issues, past ads and keywords, preferred channel and best times, other contacts. Missing items show on each touch until they're ticked off. **We store only "received", never the logins themselves.**
- **Recurring asks:** reviews and photo reminders show up on touches while they're still needed.
- **"No texts" switch** (for when a client replies STOP). Text touches switch to email automatically and the card says so. Anyone on the care team can set it.
- **Preferred channel and best times** per client, shown on every touch.
- **Client care Home: "Touches due".**
  - The main person sees their clients' touches due today or overdue.
  - The backup also sees a touch once it's 2 or more days overdue.
  - VAs see everything overdue (odd-hours cover).

  That 2-day setting lives in `CARE_RULES` and can be changed.
- **Escalation to the owner:**
  - A **"Needs the owner"** button on the client page. It asks for a one-line reason and sends the owner an in-app notice straight away.
  - An **automatic** notice when someone logs a "worse" mood on a VIP or top-tier client.
  - The owner's Home lists VIP and top-tier clients that are at risk first.

  Everything else stays with the main person, as the owner asked: fix it first, escalate if not.
- **Kit:** a "Client communication playbook" SOP (the house rules, including STOP handling, "never invent numbers", "show pages only when they're really done", and that the baseline heat map comes first), plus message templates (Day-1 recap, Day 2–3, Week 1, Week-2 heat map, Survey, Referral). These are seeded as editable Kit docs, so the owner can change the wording.
- **Optional, owner to decide:** "Start onboarding" also creates the SEO team's first work orders (keyword research, competitor snapshot, baseline heat map, first two pages), with nobody assigned. That connects the comms side with the developers. If yes, it reuses the existing work order code.

**Step 1C: VA role**

- New login role **`va`**, plus `va` on the staff list.
- **VAs see:**
  - Home (Client care);
  - Clients: the list and client pages with plan name, what's included, care plan, intake, check-in history, health and touches;
  - Kit: playbook, FAQs and templates.
- **VAs can:** mark touches Done or Skip, log check-ins, tick intake items, set "No texts" and preferred channel, and press "Needs the owner".
- **VAs never see:** prices, billing, revenue, work orders, Sales, Growth, AI briefings, Data Safety, or other people's settings. The database enforces this, not just hidden buttons.
- **Note:** Atlas doesn't hold message text (GoHighLevel stays read-only, and we only read times). VAs read the actual conversations inside GoHighLevel, with their own GoHighLevel access.
- Two-factor sign-in is required, as for everyone. The owner adds VA logins the same way as other team logins (`docs/TEAM_ACCESS.md`, updated).

**Database change `0025_client_care.sql`.** The app keeps working before it runs; screens say "needs 0025".

| Table / change | Who reads | Who writes |
|---|---|---|
| `care_plans` (tiers: service, name, rank, hours, includes, rhythm settings, top tier, archived) | owner, manager, va | owner |
| `care_plan_prices` (plan → monthly price) | owner | owner |
| `client_money` (client → monthly amount; copied from `clients.monthly_usd`) | owner | owner |
| `clients` + `care_plan_id`, `backup_staff_id`, `vip`, `care_started_on`. Read rights given column by column, so `monthly_usd` is no longer readable through the app's database connection. | owner, manager, va | insert: owner and manager (a manager can't set VIP); update: owner |
| `client_care` (one row per client: no texts, preferred channel, best times, intake items received) | owner, manager, va | owner, manager, va (stamped with who and when) |
| `care_touches` (client, touch number, done/skipped, date, channel, note, who). Add-only; the owner fixes mistakes. | owner, manager, va | owner, manager, va (as themselves) |
| `care_escalations` (client, reason, who, when) and a database trigger that writes the owner's notice | owner, manager, va | owner, manager, va |
| Role `va` added to `team_members` and `staff`; read rules for `va` on check-ins, GoHighLevel **times** and Kit | — | — |

Every new table gets RLS, the restrictive two-factor (`aal2`) rule, and break-in tests in `supabase/tests/10_rls_break_in.sql`. The owner runs the migration in the SQL Editor, as before.

### Phase 2: help and growth (later; plan first)

- **Growth stage and common problems** per client (for example: "just starting", "steady", "growing", "scaling"; few reviews, no photos, missed calls, slow replies to leads). Plain rules in `src/lib/care.ts` turn these into advice for the team, such as "Recommend speed-to-lead / answering service; we can set it up". Any revenue is optional, labeled "client-reported", and owner-only.
- **Heat map and competitor review schedule** per tier (every 2 weeks; quarterly for Growth and up), with reminders to the SEO team.
- **In-app editor** for the 27-touch plan, plus per-tier variations.
- **Survey and referral results** (touches 25–27) linked to Growth surveys.
- **Hierarchy:** an "away" switch on people. The backup and then VAs pick up automatically, with clear rules for who handles what.

### Phase 3: helper bots (later; plan first; suggestions only)

All bots go through `src/lib/ai/client.ts`. Names are swapped for codes, the existing monthly budget and cost checks apply, no tools are sent, and **nothing is ever sent to a client**.

1. **Draft messages:** fill the touch's template from what Atlas knows (plan, pages done, intake missing). The rep copies, edits and sends it from GoHighLevel.
2. **Suggest next step** per client, with reasons. A person taps Add.
3. **Team helper:** answers "how do I handle X?" using only the Kit playbook, and links to the source doc.
4. **Spot drifting clients:** mostly plain rules (going quiet, touches skipped, mood trending down). The AI only writes the explanation.

**The "away bot" in the owner's roadmap needs its own decision.** It would read client texts, emails and Google reviews, and that conflicts with today's rule that Atlas never reads message bodies. It would also need new connections (reading message content from GoHighLevel, the Google Business Profile API). It is **not** in these phases. If the owner wants it later, it gets a separate plan covering the privacy review, cost and what it may read.

### Phase 4: Ads and Website (later)

Ads and Website get their own tiers, playbooks and rhythms, using the same tables. There is no new database change unless something specific comes up.

## Risks and how we handle them

- **Moving monthly amounts out of `clients`.** This is the riskiest step. Some screens read that column today, and we'll check every one. The migration copies before changing anything, and the old column isn't cleared until the owner confirms in a later migration. **Before running 0025:** the owner checks that today's daily backup exists. Rollback = run the provided undo SQL; no data is lost, because nothing is deleted.
- **New VA role = more people with access to client data.** It is limited to the care fields above, protected by RLS, covered by break-in tests for every table and every forbidden table, and requires two-factor sign-in. VAs never see prices or billing.
- **Too many reminders.** Only new or restarted clients get the 27 touches. Existing clients get the calmer rhythm. Skip is always allowed, with a reason.
- **STOP / opt-out.** Atlas can't see an incoming STOP (it never reads message text), so a person must flip "No texts". The playbook says so plainly.
- **Logging twice.** The team still logs in GoHighLevel (house rule). Atlas asks for one tap per touch. The daily sync's times show as a hint ("a text went out today"), but a person confirms each touch.
- **Real names.** Seeded playbook text, templates, tests and docs use placeholders like `[Client Name]` and `[Rep Name]`, and roles instead of people. The pasted roadmap's personal and town names are not copied in.
- **Growth tier unknown.** The tier screen works without it; the owner fills it in later.

## Tests

- **Rules** (`tests/care.test.ts`): touch due dates, next touch, skip/done, existing clients start on the steady rhythm, text→email when "No texts" is on, tier rhythm replaces `CHECK_IN_DAYS`, when a backup or VA sees a touch, when a notice goes to the owner, VIP and top tier count as important.
- **Database break-in** (`npm run test:rls`):
  - managers and VAs can't read prices, `client_money` or `monthly_usd`;
  - a manager can add a client but can't set VIP or a price;
  - VAs can't read work orders, billing, leads, AI tables or other members;
  - nobody edits another person's touch;
  - developers and sales can't read care tables;
  - every new table refuses sessions without two-factor.
- **Guardrails:** every new action starts with `notWhilePreviewing()`; no real names in seeded text; prices never render for non-owners; the playbook has 27 touches with unique numbers.
- `npm run check` (lint, types, tests, build), plus checks on phone width and desktop width in the demo preview (`atlas-demo`).

## What "done" means for Phase 1

- The owner can create tiers and see every client's plan badge, and see clients grouped by tier on the SEO screen.
- The owner or a manager can add a client in under a minute, and the client shows up with a plan and a care plan.
- Managers and VAs see no dollar amounts anywhere, and the database break-in tests prove it.
- A new client shows touch 1 on day 1. Marking it done logs a check-in, and the next touch appears on the right day.
- Client care Home shows "Touches due" for the main person, plus the backup and VAs when a touch is overdue.
- "Needs the owner" and a "worse" mood on a VIP client both reach the owner's notices.
- VAs can sign in with two-factor and only see Home, Clients (care view) and Kit.
- Times from GoHighLevel refresh at least daily without anyone pressing Sync.
- All checks and RLS tests pass, and the owner has tried each step on their phone.

## Open items for the owner (none block Step 1A)

1. Growth tier: its hours, price and extras.
2. Starter heat maps: every 2 weeks (2 a month), or 1–2 a month? (This is a tier setting, so it's easy to change.)
3. Should "Start onboarding" also create the SEO team's first work orders? (Optional item in Step 1B.)
4. Paste the onboarding checklist, if it differs from the roadmap's Week-1 intake list.

**Costs:** no new paid services. The daily sync uses the existing GoHighLevel connection. The bots (Phase 3) would use the existing AI budget and caps.
