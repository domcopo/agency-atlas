# Work hub plan (owner + manager Work screen)

Status (2026-11-27): **all five phases built, pushed to main and live** (0a534c8). **Migration 0038 run by the owner 2026-11-27** (`supabase/migrations/0038_work_hub.sql`; break-in tests pass with `npm run test:rls`).

0038 notes:
- **Done when** (`actions.done_when`, up to 500 characters, no passwords or keys). Only the owner and managers can set it; the database refuses everyone else (its own trigger, `actions_done_when_guard`, so the older developer rule from 0017 is not rewritten). Developers can read it on their own items. It isn't in the work order history yet.
- **`work_suggestion_dismissals`**: client, rule (`risk` / `onboarding` / `routine`, or `ai` for a saved AI draft; added before 0038 was run) and reason (the suggestion's "why" text). Who and when are set by the database. Owner and managers only. Add-only, two-factor, and saved once per client + rule + reason. If the reason text changes, the suggestion shows again.
- **Not in 0038:** per-person weekly capacity. The Team view uses the shared 25 h/week until you ask for it. Attachments are left out too (see below).
- **In the app:** the drawer's Done when field and the Dismiss button. Both say "needs 0038" until it's run; until then nothing is hidden.
- **Not yet:** developers don't see Done when on their own screens. Their list reads the `my_work` view, which doesn't include the new column yet.

After Phase 5 (owner asked 2026-11-27):
- **Undo (`UndoToast.tsx`):** after the Done box, X, or a board move, a bar says what changed with Undo (10 seconds, or press Z). Undo is a normal status change back to how it was (blocked keeps its reason), through `updateAction`, so the same checks run and the history shows both steps.
- **Shortcuts button:** "Shortcuts" in the header on computers, or press ?, opens the full key list.
- **Migration renumbered 0037 → 0038:** GitHub main already has `0037_audit_spend_settle.sql` from the audit session.

Phase 5 notes:
- **Spacing:** hub screens use an 8px scale, with 4px half-steps only for small gaps inside a row. Sizes of 6, 10 and 14 px were moved to the nearest step; a test keeps them out.
- **One filled button per area:** "+ New" in the header. Inside Smart add, the filled button is Organize with AI, then Confirm. On each suggestion, Approve is now a soft tint, so six suggestions don't show six loud buttons.
- **Red means late or blocked:**
  - Urgent items show an orange dot and an orange "Urgent" on the board.
  - The founder badge in Team & rules is violet.
  - Kept as they were: error messages, the Team bar over 100% (asked for in Phase 4), and Move to Trash (shared with other screens).
- **Loading, error and empty screens:**
  - `work/loading.tsx`: placeholder shapes in the hub's layout. The pulse turns off for reduced motion.
  - `work/error.tsx`: "Work didn't load. Nothing was changed." with Try again (Next 16's `retry`) and Back to Home. It never shows the error's own text, only Next's reference code.
  - The Board has its own "No work orders match / yet" line.
- **Keyboard (`HubShortcuts.tsx`, computers):**
  - N new (Smart add), / search, J / K next or previous item, Enter open in the drawer, X mark done.
  - Keys are ignored while typing, while a pop-up is open, and with Cmd, Ctrl or Alt held.
  - X acts only on the item with keyboard focus. It presses that row's own Done box (`data-row-done`), so the same server action and checks run. On the Board, X does nothing; use drag or Move to.
  - A key guide shows under the list and board on computers.
- **Light theme:** list, board, Team and Suggestions checked by eye at 1440 px (the drawer and Smart add not yet). Colours come from the existing light-theme variables (amber becomes a deep orange there, still distinct from red).

Phase 4 notes:
- **Board (`WorkOrderBoard.tsx`, used only by the Work hub):**
  - Columns: To do / In progress / Waiting / Blocked / Review / Done.
  - Same native drag-and-drop and the same `updateAction` status change as before, plus a highlight on the column you drop into.
  - Cards show the title, client, the owner's initials or an Unassigned pill, and the due date in red only when late. A title opens the drawer (`?open=`), and the open card is outlined.
  - On computers, "Move to" shows when you hover over or tab to a card; on phones it is always shown.
  - All six columns fit at 1440 px. Narrower screens scroll sideways.
- **Team (`TeamView.tsx`, `teamLoad()` in `work-hub.ts`, tested):**
  - Per person: open work due in the next 7 days (overdue included) against 25 h a week (`WEEKLY_CAPACITY_MINUTES` = `CAPACITY_MINUTES_PER_DAY` × 5).
  - The bar is green below 80%, amber from 80% to 100%, red over 100% (`TEAM_LOAD_RULES`).
  - It also shows open items, overdue, "without estimate" (counted as 1 h) and hours due later.
  - Items waiting for review don't count.
  - The founder role is left out of the team total and listed last as "Not counted as available" unless `?founder=1` ("Include founder"). People are matched by role, never by name.
  - Clicking a person shows the list filtered to them; the unassigned link shows the unassigned list.
- **Not done:** per-person capacity (needs a column; not in 0038).

Phase 3 notes:
- **Pop-ups (`HubDialog`):** built on the browser's own `<dialog>`, which keeps focus inside and closes on Esc. The content stays on the page while closed, so a half-typed note or an AI outline survives closing and reopening.
  - **Ways to open them:** "+ New", the Suggestions button, the address (`?new=1` / `?suggest=1`, also kept by the `/work/orders` redirect), Cmd/Ctrl+K for Smart add, or dropping files anywhere on the page.
  - **Dropped files:** they reach `QuickAddWorkOrders` through a browser event (`atlas:smart-add-files`). Nothing is sent until Organize with AI.
  - **Esc:** a pop-up takes Esc for itself, so an open drawer underneath stays open.
- **Smart add pop-up (`WorkPopups.tsx`, `SmartAddPopup`):** the same Smart add as before, plus the full by-hand form folded underneath.
- **Suggestions pop-up (`SuggestionsPopup`):** rule suggestions and the saved AI drafts not yet added.
  - Each card shows the reason, with Approve (adds it as shown), Edit (the form, filled in) and Dismiss.
  - Dismissed items are left out by `withoutDismissed` (client + rule + reason, `suggestionKey`). The panel says how many are hidden.
- **"More" area:** now holds only the review queue, Preview as a developer, archived and canceled work, Team & rules, and the Notices and Trash links.

Phase 2 notes:
- **Opening the drawer:** `?open=<id>` opens it (`WorkDrawer`, `DrawerShell`).
- **Shared detail view:** `WorkOrderDetail` is used by both the drawer and `/work/orders/[id]`.
  - Developers get the same buttons as before.
  - The owner and managers edit fields in place (`DrawerFields`).
- **How fields save:**
  - The new `saveActionField` is `updateAction` with an answer.
  - Both run the same rules in `applyUpdate`, which sits between them in `actions.ts` so the guardrail tests still read it as `updateAction`'s body.
  - New single-field operations: `est`, `steps` and `ghl`.
- **List rows:** they size themselves to the list's own width (container queries, `@3xl`), so they switch to two lines while the drawer is open.
- **Guardrail test change:** the test that checked the developer buttons on the work order page now checks `WorkOrderDetail.tsx` instead, with the same checks. The file list in "never touch GoHighLevel or the AI" now includes the new work files.

Phase 1 notes:
- Code is in `src/components/work/` (`WorkHeader`, `FilterBar`, `WorkList`, `WorkRow`, `RowMenu`, `WorkMore`) and in `src/lib/work-hub.ts`, which `tests/work-hub.test.ts` tests.
- The list opens on everyone's work. "My work today" shows only when your login is linked to your team profile.
- At 1440×900 the rows are 44 px tall and about 11 fit, plus the group headings.
- `eslint.config.mjs` now skips `.claude/**`, because other sessions' worktree copies in there had made lint fail.

## Goal

Merge **Work** (`/work`) and **Work orders** (`/work/orders`) into one desktop-first Work hub for the owner and managers. Keep every feature, the dark theme and the purple accent. This is a refactor of the screens, not a rewrite: same data, same server actions, same database rules.

Developers keep their own Work screen (`DeveloperWork`, `DeveloperButtons`, `DeveloperHome`), and it is not changed. The developer branch at the top of `work/page.tsx` stays as it is, and so does Preview as a developer.

## What exists today (checked in the code)

| Wanted | Already there | New schema? |
|---|---|---|
| Checklist | `actions.steps` (one per line) + `steps_done` (0016), `toggleStep` | No |
| GoHighLevel link | `actions.source_link` + `source_note` (0010), https only | No |
| Other links | `actions.links[]` (0017, up to 5) | No |
| Comments | `work_order_comments` + `addWorkOrderComment` (0017) | No |
| Activity log | `work_order_history`, written only by the database (0017) | No |
| Estimate / actual | `est_minutes`, `actual_minutes` | No |
| Blocked reason, promise date, review | `blocked_reason`, `promised_on` (0009), review (0011) | No |
| Capacity | `CAPACITY_MINUTES_PER_DAY = 300` in `work-orders.ts` (same for everyone), `personLoads` | Only if per-person numbers are wanted |
| Drag-and-drop board | `WorkOrderBoard.tsx` already uses the browser's own drag-and-drop, plus "Move to" on phones | No (no package needed) |
| Delete → Trash | `moveToTrash` / `MoveToTrashButton` (managers) | No |
| **Done when** | nothing | **Yes**: one column |
| **Dismissed suggestions** | rule suggestions vanish only when the reason goes away | **Yes**: one small table |
| **Attachments with previews** | nothing (no file storage anywhere in the app) | **Yes**: plus storage and a security change; see below |

Note: comments and history exist only for **work orders**. Issues and follow-ups open a lighter drawer (their own fields, Edit, status) without comments or history.

## Proposed migration 0038 (written only after you approve; you run it in the SQL Editor)

1. `actions.done_when text` (500 characters max). Owner and managers can edit it, and developers can read it on their own items. Until 0038 is run, the field shows "needs 0038".
2. `work_suggestion_dismissals`: which suggestion was dismissed, for what reason, by whom and when. Only the owner and managers can use it. Rows can be added and never changed. It has RLS, a restrictive two-factor (`aal2`) policy and new break-in tests in `10_rls_break_in.sql`. A dismissed suggestion stays hidden while the reason is the same, and comes back only if the reason changes.
3. *(Optional; your call)* `staff.weekly_capacity_minutes`, so each person can have their own weekly hours. Without it, the Team view uses one shared number (25 h/week, from the existing constant).

**Attachments are not in 0038.** Real file uploads would need:
- a private Supabase storage bucket and its access rules;
- file type and size checks, and a warning that screenshots may show client details;
- a change to the browser security policy (or a new server route) so previews can load.

That is a bigger, security-sensitive change. I recommend leaving it out of this redesign: the drawer shows "Links & files" from the links that already exist. Uploads would get their own plan later if you want them.

## Phases (each one ends with lint, typecheck, tests and build passing, a check that the app loads, a summary, and a stop for your OK)

### Phase 1: layout and list
- **One Work page.** The header has a title, search, "+ New", and a List | Board | Team switcher. The view and filters live in the web address (`?view=board&who=…`), so the back button and bookmarks work.
- **Stat chips that filter the list,** with a clear (x): Overdue, Today, Upcoming, Waiting, Blocked, Unassigned, In review.
- **Filter bar:** person, client, type (work order / issue / follow-up), priority.
- **Saved views,** as fixed links (no database needed): My work today, Overdue, Unassigned, Blocked.
- **List rows** about 48 px tall, in groups Overdue / Today / This week / Later that fold open and closed.
  - Each row: priority dot, title, client, an owner initial or an "Unassigned" pill, "Nov 20 · 5d late", a status pill and a Done box.
  - A "⋯" menu holds Reschedule, Assign, Mark blocked (asks for the reason), Edit, Approve or send back (items in review), and Move to Trash.
  - Every button calls the existing `updateAction` / `moveToTrash`.
- **Promises & blockers** becomes a small collapsed strip with a count, shown only when there is something in it.
- `/work/orders` becomes a redirect to `/work` that keeps the filters. `/work-orders` also goes to `/work` (in `next.config.ts`). `/work/orders/[id]` keeps working as a full page, because notices, developers and BizToad link there.
- **Nothing gets lost in the meantime.** Until phases 3 and 4 give them a final home, these move as they are into a folded "More" area under the list:
  - Smart add, rule suggestions, AI drafts and the New work order form;
  - workload, by person and the review queue;
  - archived and canceled work, Copy as text, Team & rules, Preview as a developer, Notices and Trash links.
- **Phones:** rows stack to two lines, and the filters become one "Filters" button.

### Phase 2: detail drawer
- Clicking a row opens a drawer on the right (`?open=<id>`), and the list stays visible. On a phone the drawer fills the screen.
- The detail body moves out of `work/orders/[id]/page.tsx` into one shared piece, so the full page and the drawer show the same thing.
- The drawer shows title, client, owner, due date, priority, estimate, status and blocked reason; the steps checklist; Done when (after 0038); the GoHighLevel link and other links; comments; and history.
- Fields save on their own when you leave them, through the existing actions. A small "Saved" or error note shows next to each field. Developers see the drawer exactly as before: status buttons only.

### Phase 3: Smart add and suggestions
- "+ New" or Cmd/Ctrl+K opens Smart add in a pop-up window. Dropping a file anywhere on the page opens it with the file attached.
- The AI logic stays exactly as it is, inside the existing `QuickAddWorkOrders` component. The editable draft cards before Confirm, "Add without AI" and the cost line all stay.
- A "Suggestions (n)" button in the header opens one review panel for both the free rule suggestions and the AI drafts. Each shows the reason, plus Approve, Edit and Dismiss (Dismiss is saved after 0038). Nothing is created without Approve.

### Phase 4: Board and Team views
- **Board:** the existing `WorkOrderBoard`, restyled, with the columns To do / In progress / Waiting / Blocked / Review / Done. It uses the browser's own drag-and-drop (no new package) and keeps "Move to" for phones and keyboards.
- **Team:** for each person, open hours due this week compared with weekly capacity, with a load bar:
  - green below 80%, amber from 80% to 100%, red over 100%;
  - plus an overdue count, and a click filters the list to that person.
- The math lives in a small tested function in `src/lib/work-hub.ts`. The founder role is left out of "available" unless you switch on "Include founder". People are matched by role in code, never by name.

### Phase 5: polish
- Spacing on an 8 px grid. One main (purple) button per area; other buttons are muted.
- Key facts in readable colours (no tiny low-contrast purple text). Red only for overdue or blocked.
- Clear empty, loading and error states.
- Keyboard shortcuts: N new, / search, J/K move, X done, Enter open.
- A check of the light theme.

## Files

- **Change:**
  - `src/app/(app)/work/page.tsx` (owner and manager part only);
  - `src/app/(app)/work/orders/page.tsx` (becomes a redirect);
  - `src/app/(app)/work/orders/[id]/page.tsx` (uses the shared detail piece);
  - `next.config.ts` (one redirect);
  - `WorkOrderBoard.tsx` (look and the "To do" label);
  - `src/app/actions.ts`: phases 2–3 only, a save action for Done when and `dismissSuggestion`. Both start with `notWhilePreviewing()` and are validated.
- **New:**
  - `src/components/work/` (header, chips, filter bar, list, row, ⋯ menu, drawer, Smart add pop-up, suggestions panel, team view);
  - `src/lib/work-hub.ts` (pure, tested: reading filters from the address, chip counts, date groups, "5d late" wording, saved views, team load);
  - tests in `tests/`.
- **Reuse:** `ops.ts` (`workOrderGroups`, `reviewQueue`, `suggestWorkOrders`, `workloadRows`, `promiseMissed`, `parseSteps`, `stepProgress`), `work-orders.ts` (`deadlineColor`, `deadlineText`, `personLoads`, `DUE_FILTERS`), `data-source.ts` (`getOps`, `getWorkOrderDetail`, `getWorkOrderDrafts`, `getAiStatus`), `WorkOrderDetailForms`, `EditItemForm`, `ReviewButtons`, `Step`, `QuickAddWorkOrders`/`DraftCard`, `WorkOrderForm`, `MoveToTrashButton`, `CanceledList`.
- **Not touched:**
  - the developer screens and the developer branch of the Work page;
  - `Columns.tsx`, `SideNav.tsx` and `layout.tsx` (another session's area). Their `/work/orders` links keep working through the redirect, and can be pointed at `/work` later with that session.
  - Also not touched: the Clients pages, the database schema before 0038 is approved, and GoHighLevel (read-only, as always).

## Risks
- `/work/orders` is linked from about 10 places. The redirect covers them all, and the preview rules (`previewAllows`) keep the same paths.
- Saving fields on their own could save a half-typed value. To avoid that, they save when you leave the field (not on every keystroke) and only when the value changed.
- The founder can still be assigned work. "Not available" only changes the Team view's numbers.

## Developers see "Done when" (approved and built 2026-11-27; 0039 written, not run)

**Why:** "Done when" says what finished looks like. Developers need it most, but today only the owner and managers see it. Developers read their list through the `my_work` database view, which was built before the column existed.

**Scope (small):**
- **Migration `0039_my_work_done_when.sql`** (the owner runs it in the SQL Editor):
  - `create or replace view public.my_work`, the same as 0022 with `a.done_when` added at the end.
  - Nothing else changes: same rows (a developer's own items only, two-factor required), same permissions, no new table. Developers still can't change it; the 0038 trigger already refuses them.
  - Undo is in the file as a comment: re-create the 0022 view.
- **App:**
  - `getDeveloperActions` (`src/lib/data-source.ts`) reads `done_when` and steps down to today's columns if 0039 hasn't been run, so nothing breaks before it is.
  - `DeveloperWork.tsx`: when set, a short lime "Done when: …" line sits above the steps on the developer's card.
  - The full work order page shows it to developers too.
  - Preview as a developer already gets it (it reads the normal list).
- **Tests:**
  - New break-in tests in `10_rls_break_in.sql`: a developer sees Done when on their own item through `my_work`; never another person's item; no rows without two-factor; still can't change it.
  - A pin that 0039 keeps every 0022 column in order.
  - Then `npm run check` and `npm run test:rls`.

**Risks:**
- If a column were left out of the view, developers' lists could break. The app's step-down read and the column-order test guard against that.
- No GoHighLevel, AI, money or client contact details are involved.

**Not included:** per-person weekly hours (a separate change).
