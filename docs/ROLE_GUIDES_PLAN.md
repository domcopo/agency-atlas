# Plan: role guides ("READMEs"), personal goals and an ideas inbox in Kit

Status: **approved 2026-11-25 with all four recommended answers** (owner alone reads every idea; owner + managers set goals and people tick their own done; only the owner edits the owner's guide; ideas are signed). G1 + G2 built; 0036 run by the owner in the SQL Editor on 2026-11-25 (reported success).
Migration number: **0036** (checked 2026-11-25: `supabase/migrations/` ends at `0035_audit_runs.sql`).

## The idea in one line
Kit gets a **Guide** for each job (owner, manager, developer, sales, VA): what you do, your goals, how to use Atlas, which features and helpers you have. Plus **My goals** (personal goals the owner or a manager sets) and **Send an idea** (anyone can suggest a feature; only the owner reads the inbox). Nothing is ever sent anywhere.

## Who sees what (the database and the server decide, never a hidden button)

| | Owner | Manager | Developer | Sales | VA |
|---|---|---|---|---|---|
| Guides | all 5 | all 5 | developer only | sales only | VA only |
| Edit guides | all 5 | all except owner's (see question 3) | no | no | no |
| Personal goals | everyone's | everyone's | own only | own only | own only |
| Set goals | yes | yes | no | no | no |
| Tick own goal done | yes | yes | yes (own) | yes (own) | yes (own) |
| Send an idea | yes | yes | yes | yes | yes |
| Read ideas | all | own only (see question 1) | own only | own only | own only |

"Own only" for ideas means: you see the ideas *you* sent and their status ("New", "Planned", "Done", "Not now") and the owner's short reply, so people know they were heard.

## Where the guide text lives: starter text in code + edits in the database

**Starter text in code** (`src/lib/role-guides.ts`, pure and tested):
- One guide per role, in five parts: **What you do · Your goals · How to use Atlas · Your features · Your helpers (bots)**.
- **Features and helpers come from one shared list**, each item tagged with the roles that can use it. The tests check that list against the real app, so a guide can't drift from reality:
  - every feature a guide lists is on a tab that role actually has (`MODE_TABS` in `BottomNav.tsx`);
  - BizToad appears only for the roles `toadModeFor` allows (owner, manager, developer, sales; never VA);
  - the VA guide lists no AI helpers at all (VAs have no AI);
  - billing appears only in the owner's guide.
- Why code and not only a table: the guides work **today**, before 0036 is run; the text is reviewed in Git; and a brand-new install never shows an empty Kit.
- No real names anywhere: roles only ("the founder", "client communication lead", "SEO developers").

**Edits in the database** (0036, table `role_guide_parts`):
- The owner or a manager taps **Edit** on any part. The saved text **replaces** that part's starter text; **Reset** goes back to the starter text (the edit is archived, not deleted).
- They can also **Add a section** to a guide (e.g. "Friday checklist").
- Every save keeps the old version (add-only history, like Kit pages today), so nothing is lost.
- Same plain-text marks as Kit pages (headings, bullets, bold, https links); same "no passwords or keys" check, in the app and in the database.

**Helpers (bots) the guides describe** — one line each on what it does, who can use it, its limit, and "it suggests, a person decides; it never sends":
BizToad (Ask BizToad, voice) · AI briefing · Smart add (type, talk, screenshot, PDF) · Client care next moves and drafts · Run audit in Atlas (DataForSEO lookups, AI writes the words) · Attach audit results · Scout (copy-only prompt) · SEO Watcher rounds · Owner summary / AI CEO feed and bot runs (owner) · GoHighLevel sync (read-only).

## As built (2026-11-25)
- Editable parts are **What you do, Your goals, How to use Atlas**, plus added sections. The **features** and **helpers** lists stay generated from code (so they're always accurate and tested); to add a note about them, add a section.
- Old versions are kept in the database (`role_guide_part_versions`); there is no history screen yet.
- Screens: `/kit/guides/[role]`, `/kit/goals` (owner/managers), `/kit/ideas` (everyone; the owner also gets the inbox). "Preview as developer" may open `/kit/guides/developer` only.
- Tests: `tests/role-guides.test.ts` (27) and break-in section `7ce`.

## Personal goals ("My goals")
- New table `person_goals`: who it's for, the goal text, an optional target date, done or not.
- The owner or a manager adds goals for anyone (from that role's guide or the person's profile). Each person sees **only their own** on their guide page.
- The person can tick **Done** on their own goal, and nothing else: a database trigger refuses any other change from a non-lead (they can't rewrite the goal or move the date).
- **Your numbers** (already in Atlas, no new data): the guide also shows the daily targets that already exist and that this person is already allowed to read: sales daily target (`sales_targets`) and client care daily points (`care_targets`).

## Ideas inbox ("Send an idea")
- A short form in Kit for everyone: **kind** (new feature / make something easier / something's broken), **title**, **details**.
- Saved in a new table `ideas`, always under the sender's own login (`created_by` = you, set by the database), status starts as "New".
- The owner sees **Ideas inbox** in Kit with a "3 new" count, can set a status and write a one-line reply. No deletes (status "Not now" hides it).
- Limits: 10 ideas per person per day (database trigger); text capped (title 120, details 4,000 characters); "no passwords or keys" check.
- **Nothing is sent**: no email, no message, no AI. Ideas are never fed to BizToad or the AI briefing.

## Database change: `0036_role_guides.sql` (written by me, run by the owner in the SQL Editor)
- Three tables: `role_guide_parts` (+ add-only `role_guide_part_versions`), `person_goals`, `ideas`.
- Each has: RLS on; grants column by column (no deletes for anyone); a **restrictive `aal2` (two-factor) policy**; no-secrets check; who-wrote-it stamped by the database.
- Rules in short:
  - `role_guide_parts`: owner/managers read all; others read only rows for their own role that aren't archived. Owner/managers write (owner's guide: per question 3).
  - `person_goals`: read your own, or all if owner/manager. Owner/managers add and edit. Others may only flip `done` on their own rows (trigger).
  - `ideas`: anyone inserts as themselves with status "New"; read your own, owner reads all; only the owner changes status or replies.
- **Undo** steps at the end of the file, like every migration.
- **Break-in tests** (new section `7ce` in `supabase/tests/10_rls_break_in.sql`, `npm run test:rls`), including:
  - a developer can't read the sales, VA, manager or owner guide parts;
  - a developer can't read another person's goals, or change their own goal's text;
  - a salesperson can't add a goal or edit a guide;
  - nobody can send an idea as someone else, or read another person's idea (except the owner);
  - only the owner can change an idea's status;
  - no deletes anywhere; anything below two-factor is refused.

## In the app
- **Kit page** (`src/app/(app)/kit/page.tsx`): a "Your guide" card at the top (for owner/managers: "Guides" with all five roles), "My goals", and "Send an idea". One small block; the rest of Kit is unchanged.
- **Guide screen** `/kit/guides/[role]`: the server reads the role from the database. Asking for a role you're not allowed returns "not found" (so typing another role into the address bar shows nothing).
- **Ideas inbox** `/kit/ideas` (owner) and "Your ideas" (everyone, own only).
- Phone: one column, parts fold open. Desktop (1024 px and wider): the existing two-column layout (guide on the left, goals + ideas on the right). Respects reduced motion and the light theme.
- Reads go only through `src/lib/data-source.ts`; writes only through `src/app/actions.ts` (each starts with `await notWhilePreviewing();`). "Preview as developer" shows the developer guide only, read-only.
- **Before 0036 is run:** guides show the starter text; Edit, goals, and Send an idea show "needs 0036" instead of failing.

## Phases
- **G1 (no database change):** starter guides in code, the shared feature/helper list with its tests, guide screens (phone + desktop), role filtering on the server, "Your numbers". Tests: a developer/sales/VA gets only their own guide from the data layer and the guide route; feature lists match tabs and BizToad rules; name-leak test still passes.
- **G2 (0036):** editable guide parts with history, personal goals, ideas inbox, break-in tests, "needs 0036" fallbacks.
- Each phase ends with `npm run check` and `npm run test:rls`, and a look at the screens as each role on phone and desktop widths.

## Files touched
New: `src/lib/role-guides.ts`, `src/lib/ideas.ts`, `src/app/(app)/kit/guides/[role]/page.tsx`, `src/app/(app)/kit/ideas/page.tsx`, `src/components/kit/` (guide, goals, idea form), `supabase/migrations/0036_role_guides.sql`, `tests/role-guides.test.ts`.
Shared (small, appended): `kit/page.tsx` (one block), `data-source.ts` (new read functions at the end), `actions.ts` (new actions at the end), `10_rls_break_in.sql` (section 7ce), `CLAUDE.md` (one feature-index row + 0036 in the migration list), `docs/PROJECT_HISTORY.md`.

## Cost, risks, what this isn't
- **$0**: no AI, no new packages, no outside services.
- Risk: guides go stale as features change. Mitigation: the tests above fail when a guide names a feature a role can't reach; the Kit "needs a review" flag (90 days) also applies to edited parts.
- Risk: ideas or goals contain client details. They stay inside Atlas under the same two-factor and RLS rules; never sent to the AI.
- Not included: notifications by email/text, voting on ideas, AI summaries of ideas.

## Questions for the owner (my recommendation first)
1. **Ideas:** only the owner reads everyone's ideas (managers see only their own)? *Recommended: owner only.* Alternative: managers read all too.
2. **Personal goals:** owner **and** managers can set them, and people can tick their own done? *Recommended: yes to both.*
3. **The owner's guide:** only the owner edits it (managers can read it)? *Recommended: yes.* Alternative: managers edit it too.
4. **Ideas are signed** with the sender's name (not anonymous)? *Recommended: signed*, so the owner can ask follow-up questions.
