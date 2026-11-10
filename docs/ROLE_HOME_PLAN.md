# Plan: a Home screen for each job (client care, work lead, sales)

Status: **approved 2026-11-10 with the recommended choices (automatic + switcher; sales pick Sales once; all three layouts). Built.** No database step needed.

## The idea in one line
Same app, same permissions. Each person's **Home** shows what *their* job needs first. Everything else stays one tap away on the usual tabs.

## Why not new roles or logins
Atlas has three login roles: owner, manager and developer. The database's security rules are built on those three, and they're tested.

Adding "sales" or "client care" as new *login* roles would mean new database rules, new break-in tests, and more ways to get it wrong. A different **layout** for Home needs none of that:
- A manager who picks the "Sales" layout can see exactly what they can see today, just arranged differently.
- So this phase has **no database change, no new permissions, no new packages, no AI and no cost**.

## How each person gets their layout
- **Automatically, from their team profile** (the job already set on their profile):

  | Team profile job | Home layout they start on |
  |---|---|
  | Founder (you) | **Everything** (today's Mission Control, unchanged) |
  | Client manager & calls | **Client care** |
  | Client communication & work orders | **Work lead** |
  | SEO developer | Developer "Today" (already built, unchanged) |

- **A switcher at the top of Home** (owner and managers only): *Everything · Client care · Work lead · Sales*.
  - Anyone can flip, for example a client manager who also does sales.
  - The choice is remembered on that device, the same way as other small preferences. It only changes the arrangement, never what anyone can see.
- **If a login isn't linked to a team profile**, they start on **Everything**.

## The layouts

All of these reuse pieces that already exist and are already tested; mostly it's choosing and ordering them. "My" means items for the signed-in person's team profile. If their login isn't linked to a profile, the lists show the whole team.

### Everything (owner default)
Today's Mission Control, unchanged:
- numbers strip;
- your owner-only Billing card;
- review queue;
- the four Home buttons;
- radar, Today's priorities, AI briefing.

### Client care (client managers)
1. **Numbers strip:**
   - my clients;
   - my at-risk clients;
   - clients waiting for our reply (from GoHighLevel times);
   - check-ins overdue.
2. **Needs attention:** my clients that are at risk or need attention, with the reason, for example "no contact 19 days" or "client reached out 3 days ago, no reply".
3. **Promises due:** client promises due in the next 7 days or missed (my clients).
4. **My follow-ups and issues:** today's priorities, filtered to me, with the usual Done / reschedule buttons.
5. A link to **Clients** and **Log a check-in**.

### Work lead (whoever runs work orders)
1. **Numbers strip:**
   - waiting for review (and the average wait);
   - stuck (blocked);
   - overdue work orders;
   - unassigned.
2. **Review queue:** oldest first, with Approve / Send back (same buttons as on Work orders).
3. **Stuck:** blocked items, with the developer's "I'm stuck on…" reason and who it belongs to.
4. **Team load:** the workload chips per developer, so you can see who's full.
5. **Unassigned and overdue:** with Assign.
6. Links to **Work orders**, **Suggested work orders** and **Quick add**.

### Sales
1. **Numbers strip:**
   - new leads this week (GoHighLevel opportunities);
   - lead follow-ups due or overdue;
   - appointments today;
   - open pipeline value (labeled "open deals · not revenue", as now).
2. **Lead follow-ups due:** the follow-ups you added on the Sales tab (app-only; GoHighLevel stays untouched).
3. **Appointments:** today and the next 7 days (times and calendar names only, as now).
4. **Newest leads:** with a link to the Sales tab.
5. **GoHighLevel stays read-only:** no new access, and nothing is sent.

## What does NOT change
- **Permissions:**
  - managers see what they see today, nothing more;
  - billing stays owner-only (the Billing card never appears on any layout but yours);
  - developers are unchanged.
- **The tabs** (Clients, Sales, Work, Growth, Kit) stay exactly as they are.
- **The owner summary and the AI briefing** are unchanged.

## Decisions for you
- **D1: layout picked how?**
  - **Recommended:** automatic from the team profile, plus the switcher (remembered per device).
  - Alternative: you assign each person's layout and they can't switch. That's stricter but less flexible, and it needs a small database setting.
- **D2: sales.** There's no "sales" job on team profiles today.
  - **Recommended:** your sales people pick **Sales** from the switcher once (it's remembered).
  - Alternative: add a "Sales" job to team profiles, so it's automatic. That's a small database change, which I'd do as a separate step later.
- **D3: build all three, or start with one?**
  - **Recommended:** all three, in this order: switcher + Client care, then Work lead, then Sales. Each is its own commit, so you can try them one at a time.

## Files that would change
- **New:**
  - `src/lib/home-layouts.ts`: which layout to start on, plus the "my clients / my items" filters (pure functions, tested);
  - `src/components/home/` with one component per layout (`ClientCareHome`, `WorkLeadHome`, `SalesHome`) and the `HomeSwitcher` chips.
- **Changed:**
  - `src/app/(app)/page.tsx`: choose the layout; the Everything layout stays as it is;
  - `src/app/actions.ts`: `setHomeLayout` saves the choice in a small cookie. Like every action, it is refused while previewing a developer;
  - `src/lib/data-source.ts`: no new reads expected; small helpers only if needed.
- **Tests:**
  - `tests/fixtures.test.ts`, `tests/guardrails.test.ts`.

## Tests (what "done" means)
1. **Starting layout:** each team job maps to the right layout. Unknown or unlinked people get Everything. Developers never get these layouts.
2. **"My" filters** (fictional data):
   - client care shows only my clients;
   - work lead counts review, blocked, overdue and unassigned correctly;
   - sales lists only lead follow-ups, never client work.
3. **Guardrails:**
   - the Billing card appears only for the owner, whatever the layout;
   - the layout cookie accepts only the four names and is httpOnly;
   - layouts read data only through `data-source.ts`, and no layout calls GoHighLevel or the AI.
4. `npm run check` passes. No database change, so the database tests stay as they are and must still pass.
5. **Live check:**
   - you flip through all four layouts;
   - a client manager confirms their Home opens on Client care.

## Not in this plan
- New login roles or new permissions (deliberately avoided).
- Sales dashboards with revenue goals or commissions. That needs data Atlas doesn't have.
