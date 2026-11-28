# Clients page redesign: the Journey Line

Status: **approved and built 2026-11-25** (not committed until the owner asks). Branch `claude/clients-journey-line-66423a`. `0038_journey_steps.sql` is written and break-in tested on a throwaway local database; **the owner runs it** after deploying this code.

Owner's answers: build it; migration **0038**; item 7 as a **one-time owner action with a preview**; survey on **touch 26 only** (25 stays the 90-day headline).

Changes from the plan while building (small, for a calmer screen):
- The side panel does not remember "open": it starts closed every visit, and on computers it slides over the page instead of squeezing the client list.
- Action cards show everyone's clients (like the old "Touches due" on this page), with an "Only my clients" button for anyone linked to a team profile.
- Text and email touches get "Mark sent" (plus a Copy button for the draft); call and video touches get "Log call", which opens the drawer so the rep can pick talked / no answer.
- Popovers open below the line (solid background) so they never cover the dots.

## Goal in one sentence

A calmer `/clients` screen where the client communication rep (usually a VA) sees, in one glance, **who needs a touch today**: a single line showing where every client is on the 27-touch first-90-days plan, and a short stack of "do this now" cards under it.

What stays the same: the routes (`/clients`, `/clients/[id]`, `/clients/new`, the owner setup screens), the data, the dark theme with the purple accent, the left side menu, the light theme on computers, and who can see what (VA, manager, owner; amounts owner-only).

---

## 1. What's on the new screen, top to bottom

```
┌ Clients   12 active · 33 total   [● 9/15 pts today]      [growth line] [+ Add client] ┐
│ Active/month $…  ·  Paused 2  ·  Avg months 14            (one slim row)              │
│                                                                                       │
│   ③        ②           ⑤                ①          ②          ⑫     ← count chips      │
│ ━━━━━━━|━━━━━━━━━|━━━━━━━━━━━━━━━━━|━━━━━━━━━|━━━━━━━━|━━━━━━━━━━━━  ← 6 coloured segments
│ ' ' ' ●' ' '●●' ' ' ' ' '◉' ' ' ' ' ' '  ' ' '●' ' ' ' ' ' '  ●●●●     ← 27 ticks + client dots
│ Kickoff  First results    Month 2         Month 3   90-day wrap  Grow                 │
│                                                  [Open full pipeline]                 │
│                                                                                       │
│ ▸ (!) Sample Plumbing (fictional) · Touch 12 · 45-day check-in call   [Mark done]     │
│ ▸ (✉) Sample Roofing (fictional) · reached out yesterday (GoHighLevel)  [Open client] │
│ ▸ …at most 5 cards…                                     [Show 4 more]                 │
│                                                                                       │
│ Client list (search, filters, stage filter) — as today                                │
│ Wins and losses — as today                                                            │
└───────────────────────────────────────────────────────── [▸ More: services · health · win back] ┘
```

1. **Header (kept):** "Clients", active/total count, Add client (owner/manager), the small growth line. **Today's goal** moves from a big card to a small chip next to the title ("9 / 15 points today"), tapping it opens the restart/goals page for the owner and does nothing extra for others.
2. **Revenue strip (kept, slimmer):** one row, smaller numbers. Money still shows **only for the owner** (`summary.moneyShown`); everyone else sees counts (Active, Paused, Avg months), never "$0".
3. **Journey Line (new):** replaces the six Journey board boxes. Details in section 3.
4. **Action cards (new):** replace **Risk alerts**, **Touches due** and the old **Check-ins due** list. Details in section 4.
5. **Client list and Wins & losses (kept)** below, unchanged.
6. **Right-side panel (new, collapsed by default):** By service, Client health, Win back, and the owner's "Owners & next steps" list. On computers it is a slide-out panel from the right edge; on phones it is a "More" section at the bottom that opens on tap. Its open/closed state is remembered per browser (local storage, no data in it).
7. **The owner's setup buttons** (Set up clients, Plan tiers, Restart journeys, Match GoHighLevel, and the new **Journey steps** editor) stay, as one small row of links under the revenue strip, owner/manager only.

---

## 2. Component list (reused vs new)

| Component | New / reused | What it does |
|---|---|---|
| `PageHeader`, `GlassCard`, `SectionTitle`, `Columns` | reused | Page frame, cards, headings |
| `GrowthLine` (CareWidgets) | reused | Small growth chart in the header |
| `CareGoalCard` → **`CareGoalChip`** | new (small) | Today's goal as a chip; same numbers from `getCareToday()` |
| **`RevenueStrip`** | new (moved out of the page) | Slim one-row version of today's three numbers; same owner-only rule |
| **`JourneyLine`** | new | The 6-segment line, 27 ticks, count chips, client dots, legend; server-rendered shell + small client part for hover/tap |
| **`JourneyTick`** | new (inside JourneyLine) | One touch: popover with name, channel, deliverable |
| **`ClientDot` / `DotCluster`** | new | A client's initials at their touch; stacked when several share a touch; popover lists names |
| **`ActionCards`** | new | Up to 5 slim cards + "Show more"; animate in/out |
| `RiskAlerts` | reused logic, retired on this page | Its risks (from `getOps()`) become action cards; the component stays for Home |
| `touchesDue()` (journey.ts) | reused | Feeds the "touch due / overdue" cards |
| **`PipelineOverlay`** | new | Full-screen view: every client grouped by stage → touch, with filters |
| **`ClientDrawer`** | new | Side drawer: the client's 27-touch timeline, deliverables, latest audit, heat maps, GBP recommendations |
| `JourneyCard` (client page) | reused inside the drawer | The existing touch timeline, Done/Skip/unanswered call, copy-only drafts |
| **`SidePanel`** | new | Collapsible right panel holding By service, Client health, Win back, Owners & next steps |
| `OwnerGaps`, Win back list, By service grid, Client health counts | reused (moved into SidePanel) | Same content, same rules |
| `RosterBrowser`, `WinLossSection` | reused unchanged | Client list and wins/losses |
| `JourneyBoard` (CareWidgets) | retired | Replaced by the Journey Line (code removed once nothing uses it) |
| **`/clients/journey` page** (`JourneyStepsEditor`) | new | Owner/manager edit screen for the 27 steps + Grow rhythm (section 5) |
| **Place clients by start date** (on `/clients/restart`) | new | Owner one-time action with a preview (section 6) |

New pure, tested helpers (no screen code inside, all in `src/lib/`):

| File | Function | Purpose |
|---|---|---|
| `src/lib/journey-line.ts` | `lineLayout(steps)` | Where each segment and tick sits (in %), from the step config |
| | `dotsByTouch(journeys, signals, today)` | Which clients sit on which tick, and each dot's state |
| | `actionCards(input)` | Builds, ranks and de-duplicates the cards (max 5 shown) |
| | `pipelineGroups(rows, filters)` | Grouping and filters for the overlay |
| `src/lib/journey.ts` (extended) | `stepsFromConfig(rows)` | Database steps with the code values as fallback |
| | `placementFor(startDate, today, steps)` | Which touch a client should be on, from their start date |
| | `parseJourneyStep(raw)` | Checks the edit form, plain-English errors |

**No new packages.** Animations are plain CSS (transitions and keyframes), no animation library.

---

## 3. The Journey Line in detail

- **Segments:** 6, in the order Kickoff, First results, Month 2, Month 3, 90-day wrap, Grow (the names already used in `JOURNEY_STAGES`). Width is proportional to the number of touches in each stage (4, 5, 9, 5, 4), and Grow gets a fixed slice (about three ticks wide) since it has no numbered touches. Each segment has its own colour **and** its text label under it; the colour never carries meaning alone.
- **Ticks:** 27, evenly spaced within their segment (spacing by day would pile touches 5 and 6, both day 14, on top of each other). Hover (computer) or tap (phone) shows: "Touch 12 · 45-day check-in call · Call · Deliverable: none" and the day ("day 45").
- **Count chip** above each segment: how many clients are in that stage, plus a small "2 overdue" mark when any are overdue.
- **Client dots:** the client's initials in a small circle at their current (next open) touch. Several clients on one touch stack into a cluster showing "+3"; hover/tap lists their names, each a link that opens the client drawer. Grow clients sit in the Grow segment as a cluster.
- **Dot states, each with a shape/icon as well as a colour** (no colour-only meaning), plus a small legend under the line:

  | State | Look | Icon | Rule |
  |---|---|---|---|
  | Normal | grey ring | none | next touch due later |
  | Due today | amber, gentle pulse | clock | next touch due today |
  | Overdue | red, pulse | `!` | next touch due before today |
  | Client reached out | purple glow | speech bubble | GoHighLevel shows a call/message **from** the client newer than the team's last contact (see section 7) |

- **Sliding forward:** each dot keeps the same key, so when a touch is marked done and the page refreshes, the dot slides to its new tick (CSS `transition` on position, about 0.6 s). It animates only within one visit; arriving on the page fresh shows dots in place.
- **`prefers-reduced-motion`:** no pulse, no glow animation, no slide, no card animation. The icons still show the state.
- **Accessibility:** the line is a row of real buttons (one per segment) with labels like "Month 2: 6 clients, 2 overdue. Open full pipeline." Popovers open on keyboard focus and close with Esc. A text summary ("3 overdue, 2 due today, 1 reached out") sits above the line for screen readers.
- **Phones:** 27 ticks fit at 375 px but are too small to tap one by one, so on phones a tap on a segment opens the full pipeline at that stage; the tick details are in the overlay.
- **Clicking the line or "Open full pipeline"** opens the overlay (section 4b).

## 4. Action cards

A card appears only when a client needs action. Each card: client name, touch number and name (when there is one), one line of context, **one** main button.

| Card reason | Source | Context line | Main button |
|---|---|---|---|
| Touch overdue | `journeyState` (existing) | "Overdue since Nov 21 · Call" | **Mark done** (records the touch, same as today's Done) or **Open draft** when the touch has a copy-only template |
| Touch due today | same | "Due today · Text" | same |
| Client reached out | GoHighLevel contact **times** (0008) | "Reached out Nov 24 (call), no team contact since" | **Open client** |
| Risk alert | `getOps().risks` (existing Risk alerts) | the existing reason, e.g. "Health dropped to At risk" | **Open client** |
| Stage change ready | pending VA pause/lost requests (`va_requests`, 0033), owner/manager only | "VA asked to pause: Price or budget" | **Review request** |
| Onboarding finished early | all 27 handled, client still shown in "90-day wrap" | "All 27 touches handled" | **Move to Grow** (records nothing new; journey math already does this, so this card only appears if the data disagrees — may be dropped if it never fires) |

- **Order:** overdue first (oldest first), then reached out, then due today, then risks, then requests; VIP / top tier first within each group (existing `byImportance`). One card per client (the most urgent reason wins; other reasons appear as small tags on the same card).
- **Who sees which cards:** same scope as today's Touches due: a VA or manager sees their own clients plus overdue ones where they are backup; the owner sees everyone. Risk alerts follow the existing `getOps()` rules (RLS decides).
- **At most 5 visible**, then "Show N more" expands in place.
- **Animation:** cards fade/slide in and collapse out when handled (reduced motion: no animation).
- **"Mark done" / "Mark sent" only records it in Atlas.** Nothing is ever sent from the app. The rep sends from GoHighLevel or their phone, then taps the button. It uses the existing `logTouch` action (which also logs a check-in so health stays right).

## 4b. Full pipeline overlay and client drawer

- **Overlay:** full screen, opened by `/clients?view=pipeline` (so Back closes it and it can be bookmarked). Every client grouped by stage, then by touch. **Filters:** service, main person (owner of the client), health, overdue only. Esc / Close returns to the page. Focus is kept inside while open.
- **Client drawer:** `/clients?view=pipeline&client=<slug>` slides in from the right (bottom sheet on phones):
  - the 27-touch timeline (done, skipped, due, upcoming), reusing `JourneyCard`, with each touch's **deliverable** and whether it was done (done = sent; see below);
  - **latest audit**, **heat map history**, **GBP recommendations**: see section 7 for what exists today;
  - a link to the full client page.
- The overlay loads its data on the server only when opened, so the normal page stays fast.

---

## 5. Deliverables and editable steps (database change)

**Proposed migration: `0038_journey_steps.sql`.** `CLAUDE.md` says the next free number is 0037, but `main` already has `0037_audit_spend_settle.sql`, so the next free is **0038**. Please confirm 0038 before I write it (several sessions claim numbers).

Today the 27 touches live in code (`src/lib/journey.ts`). The change:

- New table **`journey_steps`**: one row per touch (steps 1–27 and the three Grow rhythm steps 101–103), seeded in the migration with **exactly today's wording** from `journey.ts`. Columns: `step` (fixed), `stage` (fixed), `day`, `title`, `how`, `channel` (call/text/email/video), `with_seo`, `say`, `ask`, `template`, **`deliverable`**, `updated_by`, `updated_at`.
- **Deliverable types** (a fixed list, checked by the database): `none`, `baseline_audit` (from the sale), `progress_update` (weekly progress / mini-audit), `heat_map` (bi-weekly snapshot), `monthly_report`, `gbp_recs`, `pages_update`, `review_photo_ask`, `survey`, `referral_ask`.
- **Suggested starting deliverables** (owner can change all of them on the edit screen): 1 baseline audit · 3, 4 pages completed · 5 heat map · 7, 15 review/photo ask · 8, 16 monthly report (each with heat map) · 11 GBP recommendations · 14 progress update · 24 monthly report (90-day) · 26 survey · 27 referral ask · 101 monthly report.
  - **Question for the owner:** your brief says the survey is touches 25–26. In today's plan, touch 25 is the "90-day headline" text that *mentions* the survey is coming, and 26 is the survey itself. I suggest 25 = monthly report headline and 26 = survey. Say if you want 25 marked as survey too.
- **What can be edited without code:** title, how, channel, day (must stay in order and between 0 and 120), what to say, what to ask, the copy-only template, the deliverable, and "with SEO team". **Fixed:** the step numbers (1–27) and which stage each belongs to, because saved touch history, today's goal points and "moved a stage" all count by step number. Adding or removing steps would be a later, separate change.
- **Who can edit:** owner and managers. VAs, developers and sales cannot (VAs can read; developers and sales cannot read at all).
- **Security (as for every table):** RLS on; read for owner/manager/VA only; update for owner/manager only; **no insert or delete for anyone** (the 30 rows are fixed); a **restrictive `aal2` rule** (two-factor sessions only); length checks; templates may only use the `[First name]`, `[Your name]`, `[Business]` placeholders and are refused if they contain an email address or phone number. `updated_by` is set by the database, not the app.
- **Edit screen:** `/clients/journey`, a list of the 27 steps grouped by stage, each opening a small form. Every save goes through `src/app/actions.ts` (`saveJourneyStep`, starts with `notWhilePreviewing()`), checked by `parseJourneyStep`.
- **Before 0038 is run** the app keeps working with the wording in code, and the edit screen says "needs 0038".

## 6. Placing existing clients at the right touch (item 7)

Today a client with no journey start date shows as **Grow**. I recommend a **one-time owner action with a preview**, not an automatic database update in the migration, because:
- you see exactly where each client will land before anything changes;
- it reuses the pattern of the existing "Restart journeys" screen;
- a SQL update inside a migration runs blind and is harder to undo.

**How it works** (on `/clients/restart`, new section "Place by start date"):
- For each **active** client with a start date and **no** journey start date yet:
  - **day 0–90 since start:** journey start = their start date, and they are placed on the first touch whose day is today or later (e.g. a client who started 40 days ago lands on touch 12, "45-day check-in call", due in 5 days). Earlier touches show as "placed" (not done, not overdue, not counted toward anyone's daily points).
  - **past day 90:** stays in **Grow** (same as now).
  - **no start date:** listed as "needs a start date", left in Grow.
- Clients who already have a journey (started or restarted) are not touched.
- Preview first; nothing changes until **Place clients** is pressed.
- This needs one more column in 0038: **`clients.journey_placed_step`** (touches before it count as "placed"). The existing Restart action clears it so a restart begins at touch 1. Owner only (the database already lets only the owner change these client fields; I'll confirm against the 0028/0033 client guard and add a break-in test).

---

## 7. What depends on data the app doesn't have yet

Honest list; anything here shows **"not available yet"** on screen rather than made-up data.

| Brief item | Available? | Notes |
|---|---|---|
| Touch due / overdue | **Yes** | From the journey (0028, 0031) |
| Risk alerts | **Yes** | From the existing health rules |
| Stage change ready (VA requests) | **Yes** | From `va_requests` (0033) |
| "Client replied" | **Partly** | GoHighLevel gives only contact **times**, never message text. Atlas can say "the client called or messaged on Nov 24 and the team hasn't contacted them since" (inbound time newer than the team's last outbound and last logged contact). Only for clients matched to a GoHighLevel contact and after the daily sync. Labelled "Reached out", never "Replied: …". GoHighLevel stays read-only. |
| "New review" | **No** | Nothing in Atlas tracks a client's Google reviews. SEO Watcher tracks rankings and the Maps top 3's review averages for markets, not the client's own new reviews. Card type is left out for now. |
| Heat map history | **No** | Heat maps are made outside Atlas and sent in reports; Atlas stores none. Drawer shows "not available yet". The `heat_map` deliverable still lets the rep record that the snapshot was sent. |
| GBP recommendations | **No** | No source in Atlas. Drawer shows "not available yet"; the `gbp_recs` deliverable records that they were sent. |
| Latest audit | **Partly** | Saved audits belong to **leads** (`lead_ghl_id`), not clients. If a client's GoHighLevel match is the same contact the sales audit was made for, the drawer links it; otherwise "No audit linked". Shown to owner/managers only (VAs and audits: as today, no access). |
| Deliverable "sent" | **Yes** | Marking the touch done records that its deliverable was sent. No separate "sent" flag. |
| Animate on advance | **Yes** | Within a visit, see section 3 |

Possible later step (not in this plan): a "heat map / GBP recommendations" record per client, or SEO Watcher feeding a client's map-pack rank history. That would be its own plan.

---

## 8. Risks

- **Busy screen on phones:** 27 ticks are small. Mitigation: phones tap a segment (big target) to open the overlay; dot details are in the overlay.
- **Wrong placement:** a client's recorded start date may be wrong. Mitigation: preview before placing; restart still available.
- **Editing steps changes everyone's schedule at once** (e.g. changing touch 12's day moves every client's due date). The edit screen warns about this. Step numbers stay fixed so history and points don't break.
- **"Reached out" can be a false alarm** (e.g. the client called and the rep spoke to them but didn't log it). Mitigation: the card disappears as soon as any team contact is logged or GoHighLevel shows an outgoing contact.
- **Another session editing the same files** (`CareWidgets.tsx`, `journey.ts`, `clients/page.tsx`): the client care session's PR is merged and it is idle. I'll merge `main` again right before building and keep changes to those files small.
- **Speed:** 33 clients is small; the overlay and drawer load only when opened. No extra database round trips on the main page beyond one read of `journey_steps`.
- **Privacy:** no new personal data is collected; no client names in code, tests or docs (samples use "(fictional)" names); nothing new is sent to the AI.

## 9. Tests

- **Pure functions** (`tests/journey-line.test.ts`, additions to `tests/journey.test.ts`): segment and tick layout; dot states (due today, overdue, reached out, normal); clustering; card building, ordering, one-per-client, max 5; filters; `placementFor` (day 0, day 40, day 90, day 91, no start date, future start date); `stepsFromConfig` fallback; `parseJourneyStep` (day order, length, allowed placeholders, refuses emails and phones); journeyState with a placed step (placed touches not overdue, not counted as points).
- **Guardrails** (`tests/guardrails.test.ts`): still passing; new writes live in `actions.ts` and start with `notWhilePreviewing()`; no new `.rpc(`; deliverable list in code matches the database check (a test compares them, like the intake keys).
- **Database break-in tests** (`supabase/tests/10_rls_break_in.sql`): `journey_steps`: developer and sales cannot read; VA can read but not update; manager can update; nobody can insert or delete; aal1 session sees nothing; bad deliverable / day / template refused. `clients.journey_placed_step`: only the owner can set it.
- **Checks:** `npm run check` (lint, types, tests, build) and `npm run test:rls`.
- **In the browser** (local dev, sample data): line, dots, popovers, cards, overlay and drawer at phone width (375 px) and computer width, light and dark theme, keyboard-only, and with reduced motion turned on. Screenshots in the report.

## 10. What "done" means

- `/clients` shows the slim header and revenue strip, the Journey Line with counts, ticks and dots, at most 5 action cards with Show more, the client list, and the collapsed right panel — for owner, manager and VA, with amounts still owner-only.
- Risk alerts, Touches due and Check-ins due no longer appear separately on `/clients` (their content is in the cards). Home is unchanged.
- The overlay and drawer work with keyboard and on phones; Back closes them.
- `0038_journey_steps.sql` is written (not run; you run it in the SQL Editor), the app works before and after it, and the edit screen and "Place by start date" preview work after it.
- Every "not available yet" item in section 7 says so on screen.
- `npm run check` and `npm run test:rls` pass; results reported honestly.
- `CLAUDE.md` (migration list, next free number, feature index row) and `docs/PROJECT_HISTORY.md` are updated.
- Nothing committed until you ask; you push.

## 11. Order of work after approval

1. Merge latest `main`; write `0038` + break-in tests; pure helpers + tests.
2. Journey Line + action cards + slim header + side panel on `/clients`.
3. Overlay + drawer.
4. Edit screen `/clients/journey`; "Place by start date" on `/clients/restart`.
5. Docs, checks, browser checks, report.

## Decisions needed from the owner

1. **OK to build this plan?**
2. **Migration number 0038** (0037 is already used by the audit caps fix)?
3. **Item 7:** one-time owner action with preview (recommended) or automatic in the migration?
4. **Survey touch:** keep 26 only (recommended) or mark 25 as survey too?

## Owner changes (2026-11-28)

- Today's goal is a full card again, beside **Client health** (both on the page, not in the side panel). By service is on the page under the cards. The side panel keeps Win back and Owners & next steps.
- The cards are now **Communications needed**: every client on the journey, one card each. Urgent first (overdue, reached out, due today, at risk, VA request), then everyone else's next touch as **Coming up** (soonest first). Each card shows the stage, the touch, and a "Send:" line (the step's *What to say*). Tapping a card opens the client drawer.
- The client drawer starts with a **Client profile**: services, plan tiers, main person, backup, client since, journey stage, last team contact, last from the client (GoHighLevel time), and the client memory notes.
- The full pipeline opens with a bigger **Long-term journey line**: the 27 touches, then Grow carries on by months as a client: Months 4–6, Months 7–12 (monthly marks), Year 2 (months 15/18/21/24), 2+ years. Grow clients sit on the last month mark they've reached (from their client start date). Rules in `longLineLayout`, `longMarkFor`, `placeLongDots` (`src/lib/journey-line.ts`, tested). Pipeline filters apply to it.
