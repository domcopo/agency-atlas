# Plan: desktop (wide-screen) layout

Status: **approved and built 2026-11-23** (side menu from 1024 px, not collapsible). Not committed yet. Medium-sized. **No database change**, no new packages, no change to who can see what.

## What the owner said
- "Desktop optimized too, and more spaced out and more visible, like full screen, kind of like wide view for desktop."
- Every screen should work well on a computer.
- **Phones must keep working exactly as now.**
- A developer uses Windows (Chrome / Edge), so it has to look right there too.

## How it works today (plain English)
- Every screen sits inside one narrow column, about **512 pixels wide**, centred on the page (`max-w-lg` in `src/app/(app)/layout.tsx`).
- On a 1440-pixel laptop screen that column uses about a third of the width. The rest is empty background.
- Navigation is a floating **bottom tab bar** (`src/components/shell/BottomNav.tsx`), and a round **Work orders** button floats bottom-right (`WorkOrdersButton.tsx`).
- Text sizes are tuned for a phone held close to your face, so on a monitor further away they read small.

## The idea in one picture

```
Phone (under 1024 px wide)      Computer (1024 px and wider)
┌──────────────┐                ┌────────┬──────────────────────────────────────┐
│  Page title  │                │ Atlas  │  Page title                  [action]│
│  card        │                │        │ ┌──────────────┐ ┌──────────────┐    │
│  card        │                │ Home   │ │ card         │ │ card         │    │
│  card        │   unchanged    │ Clients│ │              │ │              │    │
│  card        │  ───────────►  │ Sales  │ └──────────────┘ └──────────────┘    │
│              │                │ Work   │ ┌──────────────┐ ┌──────────────┐    │
│ ┌──────────┐ │                │ Growth │ │ card         │ │ card         │    │
│ │bottom tabs│ │                │ Kit    │ └──────────────┘ └──────────────┘    │
└─┴──────────┴─┘                │ ────── │                                      │
                                │ Work   │                                      │
                                │ orders │                                      │
                                │ Notices│                                      │
                                │ Safety │                                      │
                                │ Account│                                      │
                                └────────┴──────────────────────────────────────┘
```

## Where the switch happens ("breakpoints")
A breakpoint is the screen width at which the layout changes. We use Tailwind's standard ones, so no new settings.

| Width | Who | What they get |
|---|---|---|
| under 1024 px | phones, iPad portrait, small windows | **Exactly today's layout.** Bottom tabs, narrow column. |
| 1024–1279 px (`lg`) | iPad landscape, small laptops, a Windows laptop at 150 % display scaling | Side navigation + **two columns**. |
| 1280 px and up (`xl`) | most laptops and monitors | Side navigation + **two or three columns**, a bit more spacing. |
| 1600 px and up | big monitors | Content stops growing at about **1600 px** so lines and cards don't stretch silly-wide; it stays centred. |

Why 1024 and not smaller: below that, a side menu would squeeze the content back into a narrow strip, and the phone layout already works there. It also keeps the "phones exactly as now" promise simple: **every desktop change is behind `lg:`/`xl:`**, which a phone never reaches.

Note on Windows: a 1920-pixel laptop screen set to 150 % scaling (common on Windows) behaves like a 1280-pixel screen. So we design and check at 1280 as carefully as at 1440.

## 1. Side navigation on wide screens

New file `src/components/shell/SideNav.tsx` (about 120 lines).

- A fixed panel down the left side, about **240 px** wide, same dark glass look as the bottom bar.
- Top: the Atlas name/logo.
- **Main tabs**, same list, same order, same icons as the bottom bar: Home · Clients · Sales · Work · Growth · Kit.
  - Developers still see only Home, Work, Kit; salespeople only Home, Sales, Kit. The side menu reads the **same** `MODE_TABS` list the bottom bar uses (exported from `BottomNav.tsx`, so the existing guardrail test still checks the one real list). This is only which buttons show; the database is still the real lock.
  - The same amber "something new here" glow and count, using the same `useSeen` logic, so a tab you've opened stops glowing on both menus.
  - Icon + full label, bigger than the phone version (text about 15 px, rows 44 px tall).
- **Below a divider**, the things that float or hide on the phone:
  - **Work orders** with its red count. On a computer this replaces the round floating button (which is hidden at `lg` and up, so it can't cover table content).
  - **Notices** with the unread count (the pill at the top of the page stays too).
  - **Data Safety** (the green shield), shown to the same people who see it on Home today.
  - **Account**.
- The **bottom tab bar is hidden from 1024 px up** (`lg:hidden`); the side menu is hidden below it (`hidden lg:flex`). Both are in the page, so nothing depends on JavaScript to decide.
- Keyboard: the side menu comes first in the tab order, with a "Skip to content" link for keyboard users. Current page is marked for screen readers (`aria-current`), as today.
- No sliding or animation, so nothing to switch off for "Reduce motion".

Files: `SideNav.tsx` (new), `BottomNav.tsx` (export the tab list + `lg:hidden`), `WorkOrdersButton.tsx` (`lg:hidden`), `src/app/(app)/layout.tsx` (render the side menu, pass it the counts it already loads).

## 2. A wider content area

In `src/app/(app)/layout.tsx`:
- Phone: unchanged (`max-w-lg px-4 pb-44`).
- `lg`: content starts to the right of the side menu, padding grows to about 40 px each side, max width about 1600 px, and the big bottom gap (which only exists to clear the bottom tab bar) shrinks.
- The "Preview as developer" banner and the demo/sample banner at the top get matching widths so they line up with the content.

A small shared helper, **`Columns`** (new, `src/components/shell/Columns.tsx`, ~20 lines):
- On a phone it's a plain box: cards stack in **exactly today's order**.
- At `lg` it becomes a 2-column grid; at `xl` optionally 3. Each screen puts its sections into it.
- Because phones never see the grid, the order a phone shows is guaranteed not to change.

Some things should **not** go full width, because long lines are hard to read:
- Forms (add a work order, add a page, account settings) stay at about 640 px wide inside their column.
- Long paragraphs (Kit pages, Data Safety explanations) stay at about 70 characters per line.

## 3. Bigger, clearer text and spacing (computer only)

We change a handful of **shared** pieces so every screen benefits at once, all behind `lg:`:

| Piece | Phone today | Computer |
|---|---|---|
| Page title (`PageHeader`) | 28 px | about 36 px, more space below |
| Section titles (`SectionTitle`) | 13 px caps | about 14 px caps, more space above |
| Card padding (`GlassCard`) | 16 px | about 20–24 px |
| Folding sections (`Fold`) summary line | 14 px | 15–16 px |
| Gaps between cards | 10–12 px | 20–24 px |
| Number tiles (`KpiTile`, totals strips) | small | larger numbers, more room |

We will **not** enlarge the whole page by changing the base font size. That would also resize the SEO audit slides (`src/components/audit/`), which must stay exactly 1280×720, and other screens we aren't touching.

Also for computers:
- Clear **hover** highlights on rows and cards (a mouse has hover; a phone doesn't), with a pointer cursor on clickable cards.
- Visible keyboard focus stays as it is.

## 4. What changes on each screen

Only layout and spacing. No data, rules, buttons, wording or permissions change.

**Home**
- Mission Control (owner/manager): title row full width. Left column: the tab switcher, detection radar, priorities. Right column: AI briefing, top follow-ups, recent activity. At `xl` the radar and priorities sit side by side.
- Role homes (manager "Today's plan", salesperson, developer "Do this next"): the big main card on the left, the lists ("Needs attention", follow-ups) on the right.
- The 3- and 4-tile number strips spread across the width.

**Clients**
- Number strip and "Client health" full width.
- Risk alerts + Owners & next steps on the left, Check-ins due + Win back on the right.
- "By service" cards: 2 across on phone → 4 across on a computer.
- The client list (`RosterBrowser`): 2–3 cards across instead of one long list.
- **Add client form:** another session is adding this. I won't touch any Clients logic or forms. If that form has landed when I build, I only place it (e.g. in the right column or header); if not, the layout leaves room and the other session's form drops into the page as normal.
- Client detail page (`/clients/[id]`): main information on the left, a side panel on the right (owner, contacts, next step, quick facts) that stays in view while scrolling.

**Sales**
- Pipeline health full width.
- Follow-ups on the left, Sales leads on the right (salesperson view too).
- Lead page (`/sales/lead/[id]`): details on the left, reach-out buttons and history on the right.

**Work** (manager view)
- Promises/blocked and the task board: the board gets the full width, so its columns sit side by side instead of scrolling.
- Developer load and Your team: 3 cards across.
- Reference sections (Who to go to, Daily order, Priority levels) in a row of columns.
- Developer view: their list on the left, contacts/"waiting" on the right.

**Work orders** (`/work/orders`)
- Totals strip (already 5 across on wider screens) gets bigger numbers.
- Filters row stays in one line.
- **Board view** (`WorkOrderBoard`) gets the full width: this is the screen that gains the most.
- List view: work order cards 2 across at `xl`.
- Work order detail (`/work/orders/[id]`): steps, comments and history on the left; status buttons, dates, people and links on the right.

**Growth**
- Opportunities on the left; Business Dex, Survey bank and SEO audits cards on the right.
- Business Dex grid: 2 across → 4 across. Trends and insights 2–3 across.
- SEO audit **slides are not touched** (fixed 1280×720 format). Only the list page around them gets wider.

**Kit**
- Search bar full width.
- Handbook / SOPs / FAQ / Templates / Tools in 2–3 columns.
- A Kit page (`/kit/[id]`) keeps a comfortable reading width with its details at the side.

**Data Safety**
- Cards in two columns (database, AI spend, owner summary, client list, connections, access, trash, retention, checklist), each section kept whole so a title never separates from its card.

**Smaller screens:** Notifications, Trash, Billing (owner), Account, and the setup pages get the wider frame and spacing; two columns only where it helps (Billing's number tiles, Trash's list). Sign-in and two-factor pages stay a small centred box.

**Loading screen** (`src/app/(app)/loading.tsx`): the grey placeholder matches the wide layout so the page doesn't jump when it loads.

## 5. Windows (Chrome / Edge) details
- **Scrollbars:** Windows shows a real scrollbar that takes up width. We reserve its space (`scrollbar-gutter: stable`) so the layout doesn't jump sideways between short and long pages. The app already tells the browser it's a dark app, so Chrome/Edge draw dark scrollbars.
- **Font:** Windows has no Apple font, so it uses Segoe UI (already in the font list). We check that bigger titles still fit.
- **Display scaling** 100 %, 125 %, 150 %: covered by checking at 1280, 1440 and 1920 pixels wide.
- **Dropdowns:** the solid-colour fix just made stays as is.
- **Glass blur on many cards:** the frosted-glass effect costs a little graphics power. With more cards visible at once, I'll check scrolling stays smooth; if not, the blur can be lighter on wide screens only.

## Risks
| Risk | What could happen | How we handle it |
|---|---|---|
| Phone layout changes by accident | Something shifts on the phones the team uses daily | Every change is behind `lg:`/`xl:`; I compare 375 px screenshots before and after on every screen I can reach. |
| Collides with the "Add client" session | Two sessions edit `clients/page.tsx` at once | I only touch wrapper/layout lines there and build Clients last; I check the shared notes and `git status` first and won't edit a file another session has uncommitted. |
| Collides with Sales Part B (saved audits, `0023`) | Same Sales files | Layout only; no Sales logic touched. |
| Two navigation menus get out of step | A tab shows on one but not the other | Both read the one `MODE_TABS` list; the existing guardrail test keeps checking it. I'll add a test that the side menu imports that list rather than its own copy. |
| Signed-in screens can't be fully checked by me | Owner's two-factor is needed to sign in | I check with sample data locally, use "Preview as a developer" where possible, and ask you to look at the signed-in owner screens. |
| Very wide screens look sparse | Cards stretch too far | Content capped at about 1600 px, centred. |

## How it will be checked
1. `npm run check` (lint, type check, tests, build) passes.
2. Screenshots in the built-in browser at **375 px** (iPhone), **768 px** (iPad portrait), **1024 px**, **1280 px** and **1440 px**, for: Home, Clients, a client page, Sales, a lead page, Work, Work orders (list + board), a work order, Growth, Business Dex, Kit, Data Safety, Notifications.
3. At 375 px: compared with "before" screenshots, which should look the same.
4. Keyboard only: Tab through the side menu, "Skip to content" works, focus is visible.
5. "Reduce motion" on: nothing new moves.
6. Windows: I can't run Windows from this Mac. I'll check at Windows-like widths (1280 / 1440 / 1920) with a reserved scrollbar. **Please ask the developer to open the app in Chrome or Edge on Windows** and look at Home, Work and a work order.
7. Signed-in owner screens: I'll ask you to look at Home, Clients and Billing on your computer and phone after the build.

## Files (expected)
- New: `src/components/shell/SideNav.tsx`, `src/components/shell/Columns.tsx`.
- Shell: `src/app/(app)/layout.tsx`, `src/app/(app)/loading.tsx`, `BottomNav.tsx`, `WorkOrdersButton.tsx`, `PageHeader.tsx`, `PreviewBanner.tsx`, `DemoBanner.tsx`, `Fold.tsx`, `src/components/cards/GlassCard.tsx`, `src/app/globals.css` (scrollbar gutter, hover styles).
- Screens (layout classes only): the pages under `src/app/(app)/` listed above and a few cards whose inner grids should widen (`RosterBrowser`, `DexBrowser`, `TaskBoard`, `WorkOrderBoard`, `WorkOrderList`, `PulseStrip`, `HomeTabs`, `KpiTile`).
- Not touched: `src/components/audit/`, `src/app/actions.ts`, `src/lib/` rules, the database, GoHighLevel and AI code.
- Docs: this plan, a short entry in `docs/PROJECT_HISTORY.md`, and a line in `CLAUDE.md`'s feature index.

## Order of work
1. Shell: side menu, wider frame, shared text/spacing sizes. (After this alone, every screen is already wider and easier to read.)
2. Home, Work, Work orders (most-used on a computer).
3. Sales, Growth, Kit, Data Safety, smaller screens.
4. Clients last (to stay clear of the "Add client" session).
5. Screenshots, `npm run check`, then I report back. Nothing is committed until you ask.

## What "done" means
- This plan is approved and built.
- Screenshots at about 1440 px and 375 px show it working; phones look the same as before.
- `npm run check` passes.
- Committed on `main` only when you ask. You push.

## Questions for you (defaults in bold)
1. Side menu from **1024 px** (iPad landscape gets it too), or only from 1280 px?
2. Should the side menu be collapsible to icons only, to give even more room? **No for now** (simpler; can add later).

## Follow-up (2026-11-24, owner request)

- Home on computers: the client-detection radar sits top right, beside the Mission Control header, numbers and tabs; today's lists are two columns below. Phone order unchanged.
- Name and logo: "YO Marketing Co". Logo files in `public/brand/` (dark and light versions, app icon), shown by `src/components/shell/BrandLogo.tsx` in the side menu, at the top of phone screens, on the sign-in page, and as the browser tab title/icon. The files have a black background; `mix-blend-screen` hides it on the dark app. `src/proxy.ts` skips `/brand/` so the sign-in page can load the logo. Served unoptimized (the image optimizer isn't installed).
- Light theme (approved 2026-11-24): Dark / Light switch at the bottom of the side menu (`ThemeToggle.tsx`), saved in a plain `theme` cookie (`src/lib/theme.ts`, anything but "light" = dark) and read by the root layout into `<html data-theme>`. All light colors are in one block of `globals.css`, inside `@media (min-width: 64rem)` and only on pages with the side menu, so phones, tablets, sign-in and audit slides always stay dark (guardrail test). The block re-points the color tokens, including `--color-white` (so every `bg-white/5`-style tint flips to a dark tint), deepens accent colors for contrast on white, restyles `.glass`, keeps white text on solid purple buttons and swaps the logo. New tokens `panel`, `banner-teal`, `banner-amber` replace fixed hex backgrounds. Health ring colors use CSS variables.
- Not changed yet: the small "Atlas never…" notes on screens and the two-factor app label (`actions.ts`).
