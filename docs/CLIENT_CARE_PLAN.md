# Client care plan

**Status:** Phase 1 approved 2026-11-24. **Step 1A built** (pull request open, `0025` not run yet). Steps 1B and 1C not started.
**Branch:** `claude/client-care-53178d` (own worktree). **Database change:** `0025_client_care.sql` covers Step 1A only. The owner set the order on 2026-11-24: 0024 Scout, 0025 Client care, 0026 sales leaderboard, 0027 SEO Watcher. Steps 1B/1C will need `0028`+ (confirm the number first).

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

**Step 1B: the communication playbook**

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
