# Plan: simplify the developer screens

Status: **approved and built 2026-11-17.** Small. No database change.

## What the owner said
- The developer side is already simple and mostly good.
- Two changes were picked:
  1. **Work order page:** use the same big buttons as the Work card instead of the status dropdown.
  2. **Home:** show "do this next" instead of the four number tiles.
- No Windows problems reported. The aim is just that it keeps working well in Chrome/Edge on Windows.
- An AI helper for developers came up. It is **not in this plan**; see "Later" at the end.

## What changes

### 1. Work order page (`/work/orders/[id]`), developer view only
- **Today**, the Update box has a status dropdown with 5 choices, an "If blocked: on what?" box and Save. That's a second way to do what the Work card's buttons already do.
- **New:** the same buttons as the Work card, made into one shared piece so the two places can't drift apart:
  - **Start** (or **Back to it** when stuck or waiting).
  - **Ready for review** (developers still can't mark work orders done; a manager approves).
  - **I'm stuck**, with a one-line "on what?" box.
  - A smaller **Waiting on client** button. Today only the dropdown can set this, so we keep it.
- Developers get **no dropdowns** on this page at all, which leaves less to go wrong on Windows browsers.
- **History** is folded behind a tap ("Show history"). Comments, hours, links, steps and "ask to reassign" stay as they are.
- The **owner and manager** view of this page doesn't change. They keep the dropdown and all the manager controls.

### 2. Home "Today" for developers
- **Today:** four number tiles (Now / Next / Waiting / In review), a "sent back" note, and an "up next" card. Every one of them just opens Work.
- **New:**
  - **One big "Do this next" card:** the item they're working on, or else the most urgent new one. It shows the client, the due date, steps progress ("2 of 5") and a **Start** button (or "Open" if it's already started).
  - **Needs attention**, only if there is something:
    - sent back by a manager, with the note;
    - overdue;
    - a promise to the client that was missed.

    One line each, tap to open.
  - A one-line link: "All my work (N) →" to the Work tab.
- How "next" is picked is the same urgency order the Work tab already uses (sent back first, then missed promises, overdue, due today, priority). It's written once as a small, tested function (`developerFocus` in `src/lib/ops.ts`).

### Unchanged
- The Work tab (Now / Next / Waiting / Sent for review), client contact dates, and Kit.
- Preview as a developer: everything stays look only (buttons greyed out, and the server refuses too).
- All permissions. The database still decides what each developer can see and change.

## Files
- **New:**
  - `src/components/cards/DeveloperButtons.tsx`: Start / Ready for review / I'm stuck / Waiting on client, taken out of `DeveloperWork.tsx`.
- **Changed:**
  - `src/components/cards/DeveloperWork.tsx`: uses the shared buttons; looks the same as today.
  - `src/app/(app)/work/orders/[id]/page.tsx`: developers get the buttons instead of the dropdown; history folds away.
  - `src/app/(app)/page.tsx`: only the developer "Today" part.
  - `src/lib/ops.ts`: adds `developerFocus()` (pure, no database).
  - `tests/fixtures.test.ts`, `tests/guardrails.test.ts`.
- **Not touched:**
  - `src/lib/data-source.ts`, `src/app/actions.ts` and any migration. The buttons post to the same `updateAction` that already exists.
  - The SEO audit files that are currently uncommitted in the working tree.

## Database change?
**None.** No 0023. All the buttons use status changes developers can already make (`in_progress`, `waiting`, `blocked` with a reason, and "done", which the server turns into `review` for work orders and issues).

## Risks
- **Losing "Waiting on client":** covered by keeping the smaller button.
- **A manager accidentally getting the developer buttons, or a developer the manager controls:**
  - the page already decides by role;
  - a guardrail test pins that developers get no `<select>` and no "done" choice on that page;
  - the database is still the real lock: developers can only change status and ticks on their own items.
- **Preview pressing a button:** the shared buttons sit inside the same disabled block, and the server refuses saves while previewing (existing tests).
- **Windows:** the new screens use plain buttons and links, no dropdowns or date pickers. I'll check in the browser at desktop width and in dark mode.

## Tests ("done" means)
1. `developerFocus` (fictional items):
   - an in-progress item beats an open one;
   - "sent back" comes first in needs attention;
   - overdue and missed promise are listed;
   - nothing assigned → empty;
   - finished and canceled items are left out.
2. Guardrails:
   - the developer branch of the work order page has no status `<select>`;
   - the shared buttons post only to `updateAction`;
   - developer Home makes no reads beyond `getDeveloperWork`, so no revenue.
3. `npm run check` and `npm run test:rls` pass.
4. Browser check (local, sample data):
   - developer Home and the work order page;
   - narrow phone width and desktop width;
   - light and dark mode.

## Cost
$0. No packages, services or AI calls.

---

## Later (own plan, not built here): an AI helper for developers
Ideas, all copy-only suggestions. Nothing is saved or sent without a tap, which matches the AI rules in `CLAUDE.md`:
- **"Help me with this"** on a work order: suggests how to approach it, a checklist and things to double-check, using the title, steps, notes and the developer Kit guides.
- **Before "I'm stuck":** "Try these first" suggestions, and a clearer stuck note for the manager.
- **Ask the Kit:** a question answered from the SOPs, with links to the guide it came from.
- **Ready-for-review summary:** a short "what I did" note the developer can paste into a comment.

Why it's separate:
- It needs its own permission work. Today only owners and managers can use AI, and `ai_usage` logging and the monthly budget are set up for them.
- Developers must only ever send the AI what they can already see.
- It likely needs a migration (0023) and new break-in tests.

It fits with the planned **team assistant** session, so it's best designed there.
