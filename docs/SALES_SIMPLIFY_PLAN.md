# Plan: simplify the Sales screens

Status: **approved 2026-11-17. Part A built** (not committed). Part B waits for the owner's go-ahead after checking Part A.

Two parts, built in this order, each checked by the owner before the next:
- **Part A: the Sales screen cleanup.** Small to medium. **No database change.**
- **Part B: saved SEO audits for Sales, with spending caps** (audit Phase 3). **Migration `0023`.** See "Part B" at the end.

## What the owner picked (2026-11-17)
1. **One follow-up list:** the older all-pipelines "Lead follow-ups" on the Sales tab merges into the sales follow-ups.
2. **Tap a lead to open it:** lead rows get short. A real lead page holds the reach-out buttons, the lead's follow-ups and its history.
3. **Trim the owner/manager Sales tab:** Pipeline health → Follow-ups → Leads.
   - "Clients won & lost" moves to Clients.
   - The duplicate all-pipelines "Your pipeline" tiles are removed from Sales. Your "Everything" Home still shows the all-pipelines numbers (pipeline value, won this month, deals by stage).
4. **Match the "Sales" Home layout** (the Home switcher for the owner and managers) to the Sales tab: same sales-pipeline numbers.
5. **SEO audits (updated by the owner, 2026-11-17):**
   - **Salespeople may run audits**, and so can the owner and managers.
   - **Audits are saved**, so none are lost.
   - **Salespeople see only the audits they ran.** The owner and managers see all of them.
   - **Spending caps**, adjustable by the owner:
     - **$10 a week** per salesperson;
     - **$50 a month** for all audits together;
     - **$5** per single audit (existing default).

   This is Part B.
6. **Database:** Part A needs none. Part B is **`0023`** (agreed with the owner). Any later Sales change takes `0024` or later.
7. Nothing specific confuses salespeople today, so Mine / Everyone's, Refresh and the target bar stay as they are.

## What changes

### 1. Lead rows (everywhere: Today's plan, Sales tab)
- **Today:** every row shows name, stage, pipeline, value, age, owner and last reach-out, plus 5 buttons (Called · Texted · Emailed · Met · + note). A list of 15 leads is 75 buttons.
- **New:** a shorter row:
  - **Line 1:** name, with the flame for a hot stage.
  - **Line 2:** why it's on the list (Today's plan only), else stage · value · added N days ago.
  - **Line 3:** last reach-out, or "no reach-out logged".
- **Tapping the row** opens the lead page.
- One small **"Log reach-out"** button opens the same 4 buttons + note right there. It uses a plain tap-to-open (`<details>`), so it needs no extra JavaScript. The quick way to log stays one tap away.
- One shared row (`LeadRow`), so Home and Sales can't drift apart.

### 2. New lead page: `/sales/lead/[id]`
For salespeople, the owner and managers. What each person can open is decided by the database: salespeople only get open leads in the sales pipelines. Any other id shows "Lead not found", the same as a lead that doesn't exist.
- **Top:** name, stage, pipeline, value, source, added date, who it's assigned to in GoHighLevel.
- **Log a reach-out:** the big buttons (Called / Texted / Emailed / Met / Walk-in + note), the same action as today.
- **Follow-ups for this lead:**
  - Done / Tomorrow / Next week;
  - "+ Add a follow-up", with this lead already picked (no long lead dropdown);
  - for the owner and managers, also Assign and Edit, as today.
- **Reach-outs (last 30 days):** type and when, with "you" for your own. No names of other salespeople (salespeople can't read the team list anyway).
- A line saying calls and texts still happen in GoHighLevel, and Atlas never changes GoHighLevel.
- **"Run an SEO audit"** button: added in Part B, for salespeople, the owner and managers.
- The old **`/sales/[id]`** page only ever showed the fictional sample prospects (demo mode with no database). It stays for demo mode only and isn't linked from real data.

### 3. Salesperson Sales tab
Same order as today (Refresh · Follow-ups · Leads with Mine / Everyone's). It just gets the shorter rows.
- Each follow-up line links to its lead page.
- "+ Add a follow-up" stays for adding one without opening a lead.

### 4. Owner/manager Sales tab, top to bottom
1. **Refresh leads** + **Pipeline health** (Setup link for you), unchanged.
2. **Follow-ups:** one list, lead follow-ups on leads in your sales pipelines.
   - Same Done / Reschedule / Assign / Edit as today.
   - "+ Add a follow-up" lists sales-pipeline leads only.
   - Follow-ups already saved on leads in **other** pipelines aren't lost. They sit in a folded "Other lead follow-ups (N)" underneath, and only show when there are any.
3. **Sales leads:** the same short rows. No longer folded away; first 25, then "Show all".
4. **Removed from Sales:**
   - the amber "N new leads with no follow-up" box (Pipeline health's "Not contacted" already shows this, for the sales pipelines);
   - "Clients won & lost" (moves to Clients);
   - "Your pipeline" (all-pipelines tiles);
   - the "not synced yet" note, now shown inside Pipeline health when it's empty.
- The fictional sample sections (demo mode only) stay as they are.

### 5. Clients tab
- "Clients won & lost" (chart + lost / paused / churn tiles) moves there unchanged, at the bottom, folded.
- It's about clients, not leads, so Clients is its home.
- The later **client management** cleanup can rearrange it.

### 6. "Sales" Home layout (owner and managers, Home switcher)
- **Today:** 4 tiles from *all* pipelines (new leads, follow-ups due, appointments, open pipeline value), lead follow-ups, appointments and newest leads.
- **New:** built from the sales pipelines, like the Sales tab:
  - **Tiles:** Not contacted · Follow-ups due · Appointments today · Reach-outs today.
  - **Follow-ups due**, using the same list as the Sales tab.
  - **Appointments today / next 7 days**, unchanged (times and calendar only).
  - **Newest sales leads**, short rows that open the lead page.
- The open pipeline **$** tile goes. Value stays on the lead rows and in Pipeline health. If you want it back, it's one line.
- Before Sales is set up, it shows "Set up Sales →" (you) or "The owner hasn't picked the sales pipelines yet" (managers).

### Unchanged
- `/sales/setup`.
- Today's plan rules (what's picked and why).
- Targets.
- Refresh limits.
- Mine / Everyone's.
- All permissions, and GoHighLevel stays read-only.

## Files (Part A)
- **New:**
  - `src/app/(app)/sales/lead/[id]/page.tsx`: the lead page.
  - `src/components/sales/LeadFollowUpsForLead.tsx` (or reuse `SalesFollowUps` with a filter; decided while building, whichever is smaller).
- **Changed:**
  - `src/components/sales/LeadRow.tsx`: short row + link + "Log reach-out" fold.
  - `src/components/sales/TouchButtons.tsx`: a `big` style for the lead page; same action.
  - `src/components/sales/SalesFollowUps.tsx`: link each line to its lead.
  - `src/components/sales/TodayPlan.tsx`: uses the new row.
  - `src/components/forms/LeadActionForm.tsx`: optional fixed lead (hidden field, no dropdown) for the lead page.
  - `src/app/(app)/sales/page.tsx`: owner/manager order; one follow-up list; removals.
  - `src/app/(app)/clients/page.tsx`: adds "Clients won & lost" at the bottom.
  - `src/components/home/SalesHome.tsx` and `src/lib/home-layouts.ts` (`salesView`): sales-pipeline numbers.
  - `src/app/(app)/page.tsx`: only the Sales-layout branch passes sales data.
  - `src/lib/sales.ts`: small pure helpers, e.g. `leadDetail()` (one lead + its follow-ups + touches) and `splitLeadFollowUps()` (sales pipelines vs other).
  - `tests/sales.test.ts`, `tests/fixtures.test.ts`, `tests/guardrails.test.ts`.
  - `docs/SEO_AUDIT_PLAN.md`: the open question "who may run audits" is answered (owner, managers and salespeople; salespeople see only their own; caps as in Part B).
  - `docs/PROJECT_HISTORY.md`: a short entry.
- **Not touched:**
  - `src/app/actions.ts` (every button posts to the existing `logLeadTouch`, `createLeadAction`, `updateAction`);
  - `supabase/migrations/`;
  - `src/lib/ghl/`;
  - `src/lib/data-source.ts` (the lead page reads through the existing `getSales()`; if a small read helper is cleaner, it goes in `data-source.ts`, read-only, as the signed-in person).

## Database change? (Part A)
**None.** Everything uses tables and rules that `0020` already set up. The database still decides what each role can read and change. A salesperson typing another lead's id into the address bar gets "not found", because the database never returns that lead to them.

## Risks (Part A)
- **Hiding follow-ups the owner relied on:** follow-ups on leads outside the sales pipelines are kept in the folded "Other" list, never dropped. A test pins this.
- **A salesperson opening a lead they shouldn't see:** the lead page only shows leads `getSales()` returned, which the database has already limited. There's an existing break-in test ("can't see leads from other pipelines"), and `npm run test:rls` runs it again.
- **Losing the quick one-tap log:** the "Log reach-out" fold keeps it on the list; the lead page has the full version.
- **Removing "Your pipeline" and the $ tile:** those numbers came from all pipelines, so they mixed sales leads with your other GoHighLevel work. Your "Everything" Home still shows them. Easy to bring back if missed.
- **Clients tab gets one more section:** it's folded, at the bottom, until the client management cleanup.
- **Lead names are personal data:** shown as plain text, same as today. No phone numbers or emails are stored or shown.

## Tests for Part A ("done" means)
1. **Pure rules (`tests/sales.test.ts`, fictional leads):**
   - `splitLeadFollowUps`: sales-pipeline follow-ups vs "other"; done and canceled are left out; nothing is lost.
   - `leadDetail`: finds the lead, its open follow-ups and reach-outs newest first; an unknown id gives null.
   - `salesView`: built from sales leads; "not contacted" and "reach-outs today" match `pipelineHealth`.
2. **Guardrails:**
   - The lead page writes only through `logLeadTouch`, `createLeadAction` and `updateAction`; no `.rpc(`, no GHL import.
   - A lead id that isn't in `getSales().leads` leads to `notFound()`.
   - The salesperson views pass no staff list (no Assign for salespeople), as today.
   - The Sales tab no longer reads `getWinLoss` or `GhlPipelineCard`; Clients does.
3. `npm run check` and `npm run test:rls` pass.
4. **Browser check** (local):
   - sample mode for layout;
   - the salesperson and owner screens at phone width and desktop width, light and dark;
   - the "Log reach-out" fold works by tap and keyboard.

## Cost (Part A)
$0. No packages, services, AI calls or migrations.

## Rough timing (Part A)
About half a day of building, then your check.

---

# Part B: saved SEO audits for Sales, with spending caps (audit Phase 3, migration `0023`)

Built **after** Part A is checked. It follows the rules in `docs/SEO_AUDIT_PLAN.md`: no made-up numbers, every figure has a source, and what's missing shows "not found".

## Say it plainly: nothing costs money yet
The data providers (DataForSEO and others) are **not connected**. That's audit Phase 4, which gets its own plan and OK.

So in Part B:
- **"Running" an audit** means saving its settings and showing the eight pages, with every figure "not found" until real data exists. Nothing is fetched and it costs **$0**.
- **The spending caps** are built and tested now, so they're already in place on the day real data calls are added. **Until then they never block anything, because nothing spends.**

## What the owner decided
| | Owner | Managers | Salespeople | Developers |
|---|---|---|---|---|
| Run (start) an audit | yes | yes | yes, for leads they can see, or a business typed in by hand | no |
| See saved audits | all | all | **only ones they ran** | none |
| Change an audit's settings | all | all | only their own | no |
| Spending caps | sets them | sees them | sees their own ("$0 of $10 this week") | none |
| Delete | owner only, through Trash (later; for now audits can be **archived**, i.e. hidden, never deleted) | archive | no | no |

**Caps** (the lowest one wins; the owner can change all of them):
- **$5 per audit**: the existing `budgetCapUsd` default in the audit settings.
- **$10 per salesperson per week**, Monday to Sunday, New York time. It can be changed per person.
- **$50 a month for all audits together**, everyone combined.

These caps sit **under** everything else and are **separate from the $10/month AI budget**, which doesn't change. Audit data costs and AI costs are counted apart, so one can never eat the other. The AI narrative is audit Phase 6, later.

## What changes
1. **Lead page (`/sales/lead/[id]`):** a "Run an SEO audit" button. It opens a short form with the business name filled in from the lead:
   - website;
   - home town and state;
   - niche;
   - Google Business Profile link (optional);
   - average job price (marked "assumption" until the client confirms it);
   - up to 3 competitors (optional).

   **Save** creates the audit, tied to that lead.
2. **Sales tab → "My audits"** (salespeople): their saved audits, newest first, plus "$X of $10 used this week".
   - Owner and managers: Growth → SEO audits lists **all** saved audits (who ran it, for which lead), plus the fictional sample as today.
   - Each list has a "New audit" button for a business that isn't a lead yet.
3. **The audit viewer (`/audit/[id]`)** opens for salespeople too, but only for audits the database gives them (their own). Anything else shows "not found".
4. **The owner sets the caps:**
   - weekly per salesperson in `/sales/setup` (a 4th step next to daily targets);
   - the monthly total and per-audit cap on Growth → SEO audits.
5. **Before `0023` is run:** saving shows "Saving audits needs one setup step (0023 SQL)". Everything else keeps working, as the project rules require.

## Database change: `0023_saved_audits.sql` (you review it and run it in Supabase)
- **`audits`:**
  - `id`;
  - `created_by` (the login; set by the database, can't be faked);
  - `lead_ghl_id` (optional);
  - `client_id` (optional, owner/managers only);
  - `title`;
  - `config` (the settings, checked by `parseAuditConfig` before saving);
  - `data` (figures; empty until Phase 4);
  - `archived_at`, `created_at`, `updated_at`.
- **Who can read audits:** owner and managers read all; salespeople read only rows where `created_by` is them; developers read nothing.
- **Who can add audits:**
  - a salesperson can only add an audit as themselves;
  - if they attach a lead, it must be a lead they can see (open, in a sales pipeline);
  - they can't attach a client.
- **Who can change audits:** salespeople can change only their own audits' title and settings; they can't change who ran it or archive it. There's no delete grant at all.
- **`audit_limits`** (one row, owner only): `monthly_total_usd` (50), `per_salesperson_weekly_usd` (10).
- **`audit_user_limits`** (owner only): an optional weekly cap per salesperson, overriding the 10.
- **`audit_spend`** (add-only ledger):
  - Columns: `audit_id`, `user_id`, `usd`, `provider`, `at`.
  - **How it works:** before any paid data call (Phase 4), the server first records the *estimated* cost here. A database check refuses the row if it would take that person past their weekly cap, or everyone past the monthly cap. **If the row is refused, the call is never made.** So the cap is enforced in the database, not just by the app.
  - Nobody can edit or delete these rows.
  - Salespeople read only their own; the owner and managers read all.
- **Every new table:**
  - security rules (RLS);
  - the two-factor rule (restrictive `aal2` policy);
  - grants kept to the minimum.

## Break-in tests (`supabase/tests/10_rls_break_in.sql`)
- **Reading:**
  - a salesperson can't read another salesperson's audit, or one the owner ran;
  - a developer reads zero audits, limits or spend rows.
- **Adding:**
  - a salesperson can't add an audit as someone else;
  - a salesperson can't attach a lead from another pipeline, or a client.
- **Changing:**
  - a salesperson can't change `created_by`;
  - nobody can delete audits;
  - nobody can edit or delete spend rows.
- **Caps:**
  - a salesperson can't read or change the caps (theirs or anyone's);
  - a spend row past the weekly cap is refused;
  - a spend row past the monthly cap is refused (owner included);
  - a spend row for someone else is refused.
- **The existing "salesperson reads zero rows from every other table" test** gets `audits` and `audit_spend` added as *own rows only*, with explicit checks. The test is extended, never weakened.

## Files (Part B)
- **New:**
  - `supabase/migrations/0023_saved_audits.sql`;
  - `src/components/audit/AuditIntakeForm.tsx`;
  - `src/lib/audit/spend.ts`: pure cap math (week/month windows in New York time, "lowest cap wins"), tested.
- **Changed:**
  - `src/app/actions.ts`: `saveAudit` (validated, as the signed-in user, starts with `notWhilePreviewing()`) and `saveAuditLimits` (owner).
  - `src/lib/data-source.ts`: `getAudits()`, `getAudit(id)`, `getAuditSpend()`, with "needs 0023" fallbacks.
  - `src/app/audit/[id]/page.tsx`: allow the sales role, with the database deciding which audits.
  - `src/app/(app)/growth/audits/page.tsx`, `src/app/(app)/sales/lead/[id]/page.tsx`, `src/app/(app)/sales/page.tsx`, `src/app/(app)/sales/setup/page.tsx`.
  - `supabase/tests/10_rls_break_in.sql`.
  - `tests/audit.test.ts`, `tests/guardrails.test.ts`.
  - `docs/SEO_AUDIT_PLAN.md`: Phase 3 marked as this, open question answered.
  - `CLAUDE.md`: next migration 0024.
- **Not touched:** `src/lib/ai/`, `src/lib/ghl/`. **No network code** (that's Phase 4).

## Risks (Part B)
- **A new table that salespeople can read** is the main security risk. Covered by: default-deny rules, own-rows-only policies, and the break-in tests above, including the extended whole-database test.
- **Audits hold business details** (website, town, competitors) for prospects. These are business facts, not personal contact details. The intake refuses email addresses and phone numbers, like reach-out notes do. Flagged for your privacy review per the project rules.
- **A cap that's only checked in the app can be bypassed.** That's why the spend ledger refuses over-cap rows in the database, and the server must record the estimate *before* calling a provider (Phase 4 must follow this; a guardrail test will pin it when Phase 4 lands).
- **Caps don't matter until Phase 4.** Stated on screen too: "$0 used. Audits don't fetch paid data yet."
- **Typed-in text is untrusted:** it's shown as plain text and never used in prompts, SQL or tool use.

## Tests for Part B ("done" means)
1. **`spend.ts`:**
   - week boundaries (Sunday night vs Monday, New York time);
   - month boundaries;
   - lowest cap wins;
   - a per-person override beats the default;
   - $0 spend never blocks.
2. **Guardrails:**
   - `saveAudit` validates with `parseAuditConfig` and starts with `notWhilePreviewing()`;
   - no network imports in the audit code;
   - the viewer has no client-side role check doing the real locking.
3. `npm run check` and `npm run test:rls` pass, including the new break-in tests.
4. **Browser check:**
   - a salesperson saves an audit from a lead page and sees it under "My audits";
   - the owner sees it in Growth → SEO audits;
   - phone and desktop width.

## Cost (Part B)
$0 to build and to run until Phase 4. When real data is added, spending is held to $5 an audit, $10 a week per salesperson and $50 a month in all, unless you change them.

## Rough timing (Part B)
About a day of building, then you review `0023` and run it in Supabase, then a check together.
