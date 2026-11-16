# Plan: fix titles and logged check-ins (0021)

Status: APPROVED 2026-11-15 and BUILT. Waiting for 0021 to be run in Supabase.

Built: `editActionText`, `editCheckIn`, `setCheckInRemoved` (actions.ts); `EditItemForm` (item rows + work order page); `CheckInEditForm` ("Fix or remove" on the client timeline); "Removed check-ins" fold with Restore (owner). Two older database tests ("a mood cannot be changed afterwards", "check-in history cannot be rewritten") encoded the old rule; they now check that a fix is allowed AND kept in `check_in_edits`. Also: activity kind `action_edited` for renames on the client timeline.

## The gap

- **Item titles** (work orders, follow-ups, issues): there is no way to change the title after an item is created. A typo stays unless you trash the item and re-add it.
- **Check-ins** (calls, messages, meetings logged on a client): once saved, nobody can change the date, note, mood or type, or take one back. A check-in logged on the wrong client or the wrong date still counts toward health and "last contact".

## What already works

- The database already lets the owner and managers change an item's title and notes. Developers are blocked by a database guard, and that stays.
- So the title fix is app code plus history. Only check-ins need new database rules.

## What gets built

### 1. Edit an item's title and notes (owner and managers)

- An **Edit** button on the work order page and on follow-ups and issues (client page, Work tab) opens a small form with title and notes.
- The same checks as when creating an item: 1–200 characters, and no phone numbers or emails in work orders.
- **History:**
  - Work orders record "Title changed: old → new" in their history (the database trigger is extended in 0021).
  - Follow-ups and issues get a line in the client timeline.
- Developers still can't change titles. If one is wrong, they comment or ask a manager.
- Salespeople keep their current rights on lead follow-ups (no title edits).

### 2. Fix or remove a logged check-in (owner and managers)

- Each check-in on a client's timeline gets **Edit**: date (not in the future), type, mood and note.
- **Remove** hides a check-in instead of deleting it. A removed check-in no longer counts for health, "last contact", the AI briefing or developers' contact dates.
- The owner can see removed check-ins on the client page and **Restore** them.
- **Every edit or removal is kept**: the old values, who changed them and when go into an add-only `check_in_edits` list. Only the database writes it, and only the owner and managers can read it.
- There is no hard delete. If you later want "Delete forever" for check-ins, it would go through Trash like clients and items.

## Database change 0021 (you run it in the SQL Editor)

- **`check_ins`:**
  - new columns `removed_at` / `removed_by` and `edited_at` / `edited_by`, stamped by the database clock;
  - a new UPDATE permission for the owner and managers only, limited to date, note, mood, type and removed.
  - Who logged it and which client it's for can't be changed. A check-in on the wrong client is removed and logged again.
- **`check_in_edits`:**
  - add-only history, written only by a trigger;
  - RLS on, plus the required two-factor rule;
  - owner and managers can read it; nobody else can.
- **Work order history:** the trigger adds a "title" line.
- **Views:** `my_client_contacts` and the owner summary's "last logged" skip removed check-ins.
- **Old code keeps working** until 0021 is run: the Edit and Remove buttons say "needs one setup step first".

## Tests

- **Database break-in tests:**
  - developers and salespeople can't edit or remove check-ins, or read `check_in_edits`;
  - a manager can't change who logged a check-in or which client it's for;
  - nobody can write `check_in_edits` directly or delete from it;
  - removed check-ins drop out of the developer contact view;
  - two-factor is required on the new table.
- **App tests:** title checks, and every new action is blocked while previewing (existing guardrail).
- `npm run check` and `npm run test:rls` must pass.

## Risks

- **Changing past check-ins changes health scores.** That's intended, and every change is kept and visible to you.
- **A manager could hide a check-in.** You can see removed ones and restore them, and the history shows who did it.
- **Nothing new is sent anywhere.** GoHighLevel isn't touched, and no AI is involved.

## Done means

- You can fix a title, and edit or remove and restore a check-in, on your phone.
- History shows each change.
- All tests pass.
- Committed for you to push.
