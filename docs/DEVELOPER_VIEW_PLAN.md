# Plan: "Preview as developer" + a simpler developer work screen

Status: **approved 2026-11-10 with the recommended choices (D1 owner + managers, D2 tick boxes now, D3 stuck = blocked). Built.** One setup step: run `supabase/migrations/0016_step_checkboxes.sql` in the Supabase SQL Editor (the app works before it; tick boxes stay off until then).

## What you asked for

1. You (and later other admins) can tap a toggle and see Atlas exactly as a developer sees it.
2. The developer view becomes simpler and work-first, so developers can actually work from it.

These come in two parts. Part A changes no database rules. Part B adds one small database change.

---

## Part A: Preview as developer

### How it works for you
- On the Work tab (owner/manager view) there's a new button: **Preview as…**, which lists your developers.
- Pick one. Atlas switches to their view: their Home, their Work tab, their Kit, and the developer bottom bar (Home · Work · Kit).
- A bright banner sits on top of every screen: **"Previewing as [name] (developer) · look only · Exit"**.
- It ends when you tap **Exit**, or by itself after 1 hour.

### What you see
Only what that developer can see:
- **Work:** their own open items (work orders, issues, follow-ups), with steps, links, due dates and review status. No revenue, and no other people's work.
- **Client contact dates:** names plus last-contact dates, only for clients they own or have work for.
- **Kit:** developer pages and the tools list (name, purpose, link, where the login is kept). No manager pages.

### Look only
While previewing, every button (Start, Done, Blocked, step boxes) is greyed out. The server also refuses to save anything while preview is on, so a tap can't accidentally change a developer's item under your name. To make changes, exit the preview first.

### How it's built (plain English)
- **No new permissions.** You and managers can already read all of this. The preview only shows *less*.
- **How the screen gets the developer's data:** a developer's screens read two special database views (`my_work`, `my_client_contacts`) that work out "who's asking" from the login. When you're signed in, those views would show *your* items, not the developer's. So the preview reads the normal tables you already have access to and applies **the same filters the views use** ("owned by this developer, not canceled"), written once as a small, tested function.
- **The risk:** that copy of the filter could drift from the real database view, and the preview would show slightly more or less than the developer really sees.
  - **Fix:** a new database test signs in as a test developer, reads the real views, and checks that the result matches the same filter rules. If someone changes one without the other, the test fails.
- **How Atlas remembers you're previewing:** a small cookie that says which developer you're previewing. It's httpOnly, so page scripts can't read it, and it expires after 1 hour.
  - Every page load re-checks that you're the owner (or a manager, see D1) and that the chosen person really is a developer. If either check fails, the cookie is ignored.
  - The cookie never grants anything. It only changes which (smaller) screen you're shown.
- **The real lock stays in the database:** developers still can't read revenue, billing or other people's work, whatever the screen shows.

### What it won't do
- It doesn't sign you in *as* the developer. That's impossible by design: Atlas has no admin key, and you'd need their password and second-factor code. It's a faithful preview, not an impersonation.
- No billing, revenue or manager screens appear in preview, even though you can see them normally.

---

## Part B: A simpler, work-first developer screen

### Today
A developer's Home and Work tabs both show lists of items. It works, but it isn't built for doing the work: the steps are plain text, "stuck" is buried in a status menu, and Home and Work overlap.

### New layout (Work tab; Home becomes a short "Today" summary that links there)
Four sections, top to bottom:

1. **Now:** what they're working on (status *in progress*). Normally one or two items.
2. **Next:** open items, most urgent first: overdue, then due today, then by priority. Each card has a big **Start** button.
3. **Waiting:** items they marked *stuck* (blocked) or *waiting on someone*, each showing its reason.
4. **Sent for review:** items waiting for a manager. If one was sent back, the manager's note shows in amber at the top.

Each card, when opened, shows:
- **Steps as checkboxes.** A tap ticks a step, and progress shows as "3 of 5". This is the one database change (below).
- **Client name** and how long since last contact.
- **Link(s)**, such as the GoHighLevel conversation link a manager pasted.
- **Due date, plus "promised to client" date if set.**
- **Three big buttons:**
  - **Start**: moves it to Now.
  - **I'm stuck**: asks "Stuck on what?" (one line), then sets *blocked* with that reason, so the manager sees it on their screens.
  - **Ready for review**: sends it to a manager. This is the existing review step; developers still can't mark work orders done on their own.
- **"How-to" link to the Kit**, so they can open the SOPs/handbook. In this phase it's a link to the Kit tab. Linking each work order to a specific Kit page is a later option.

### Database change (`0016`, small)
- New column `actions.steps_done`: the list of which step numbers are ticked, for example `{1,3}`.
- **Who can change it:**
  - The developer guard is updated so developers can change **only** `status` and `steps_done` on their own items, exactly as today plus this one column.
  - Managers and the owner can change it too.
- **Safety checks in the database:** only step numbers that exist; no duplicates. If a manager edits the steps text later, the ticks are cleared, so nobody gets a stale "done".
- **Before you run 0016**, the screen still works; the checkboxes are simply hidden.
- The `my_work` view adds the new column, and its column-list test is updated.

### What stays the same
- All the rules from 0007, 0010, 0011 and 0013: developers see only their own items, no revenue, can't cancel, can't approve their own work.
- The manager and owner screens don't change, apart from the new "Preview as…" button and showing step progress ("3 of 5") on work order cards.

---

## Decisions for you

- **D1: who can preview?**
  - **Recommended: owner and managers.** Managers already see everyone's work, so the preview shows them nothing new, and they can use it to check what a developer sees.
  - Alternative: owner only.
- **D2: step checkboxes now, or later?**
  - **Recommended: now.** This is the main thing that makes the screen workable. It's the only database change.
- **D3: is "I'm stuck" just the existing *blocked* status with a reason?**
  - **Recommended: yes.** No new status, and managers already see blocked items on their Work screen and in the counts.

## Cost
$0. No new services, packages or AI calls.

## Files that would change
- **New:**
  - `src/lib/preview.ts` (read and check the preview cookie);
  - a pure filter function in `src/lib/ops.ts` (`developerScope`);
  - `supabase/migrations/0016_steps_done.sql`;
  - `src/components/cards/DeveloperWork.tsx` (the Now / Next / Waiting / Review screen);
  - `src/components/shell/PreviewBanner.tsx`.
- **Changed:**
  - `src/app/(app)/layout.tsx` (banner, developer bottom bar in preview);
  - Home, Work and Kit pages (choose the developer screen when previewing);
  - `src/lib/data-source.ts` (preview reads);
  - `src/app/actions.ts` (start/exit preview, refuse saves while previewing, tick a step);
  - `WorkOrderCard` (step progress for managers).
- **Tests:**
  - `tests/guardrails.test.ts`, `tests/fixtures.test.ts`, `supabase/tests/10_rls_break_in.sql`.

## Tests (what "done" means)
1. **Preview filter:** a developer's items only; canceled items and other people's work left out; contact dates only for their clients; developer Kit pages only (fictional data).
2. **Drift check (database test):** as a test developer, the real `my_work` and `my_client_contacts` views match the same rules the preview uses.
3. **Preview is look-only:**
   - every developer-facing save in `actions.ts` refuses while preview is on (guardrail test lists them);
   - a developer can't turn preview on;
   - a bad or expired cookie is ignored.
4. **No revenue or billing in preview:** guardrail test that preview screens don't call `getBilling`, the roster revenue fields, or manager-only reads.
5. **0016 break-in tests:**
   - a developer can tick steps only on their own items;
   - no step numbers beyond the list;
   - other columns are still locked;
   - managers can tick or clear;
   - ticks clear when steps change;
   - restrictive two-factor rule unchanged.
6. **`npm run check` and `npm run test:rls` pass.**
7. **Live check:** you open Preview as one developer and compare it with what that developer sees on their phone.

## Build order
1. Part A (preview), which needs no database change, so you can try it right away.
2. Part B screen without checkboxes.
3. `0016` + checkboxes (you run the SQL in Supabase, like before).

Each step gets its own commit for you to push.

## Not in this plan (later, separately)
- Different Home layouts for sales / client care / dev lead (your third idea). These would be layouts on top of the existing manager permissions, not new roles. Separate plan.
- Linking a work order to a specific Kit page.
