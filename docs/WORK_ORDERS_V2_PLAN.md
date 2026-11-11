# Plan: Work Orders, phase 1 (plus phase 2 outline)

Status: **approved 2026-11-10** with both recommended answers (managers keep create/reassign; developers keep their follow-ups, contact dates and Kit). **Step 1 built:** `supabase/migrations/0017_work_orders_v2.sql` + break-in tests (section 7n). Not run in Supabase yet: waiting for your review.

**Step 2 built (screens):** floating button, list + board + due filter, deadline colors, work order page with comments, history, links, hours and reassignment request, archive. Comments and history store the writer's name (filled by the database), because managers and developers can't read other people's logins.

Notes from building step 1:
- History and comments are for **work orders** (not follow-ups or issues).
- Owner and managers can dismiss a reassignment request; reassigning clears it automatically. Developers can't withdraw it themselves.
- Archive is only for done or canceled work (live work is canceled instead).
- Reassignment-request notices go to the owner (you), not managers.

## Short version
About two-thirds of what you asked for already exists in Atlas, built and tested over the last week:
- work orders tied to client records, with steps, priority, due date, estimate and a link;
- statuses including Blocked with a reason, plus In review;
- one-tap reassign;
- owner-only cancel (never deleted);
- the developer's own screen (Now / Next / Waiting / Review);
- quick add (type, talk or photo → draft);
- the AI CEO summary.

Developers are already locked to their own items **by the database**, and lose access the moment an item is reassigned. Break-in tests prove both.

**Phase 1 adds the missing pieces:**
- a floating Work Orders button;
- comments;
- a change history recorded by the database itself;
- start date, actual hours and several links;
- archive;
- deadline colors;
- the list, board and due-this-week views;
- "Needs reassignment";
- in-app notifications with mute;
- the new AI CEO numbers.

## What you'll get (phase 1)

1. **Floating Work Orders button, bottom-right**, just above the tab bar. That's the one corner that covers no buttons on a phone: the tab bar is centered, and page buttons sit top-right. A red badge counts your overdue + urgent items, and it opens Work Orders. Developers see the same button for *their* items.
2. **Each work order** has these fields. Existing ones are marked ✓; the rest are new.
   - Title ✓, client ✓, what needs doing ✓ (description + step checklist).
   - Assigned developer ✓.
   - Priority ✓: we store "critical"; it's shown as **Urgent**.
   - Status ✓: New, In progress, Waiting on client, Blocked + reason, In review, Done, plus Canceled (owner).
   - **Start date** (new).
   - Due date ✓.
   - Estimated hours ✓.
   - **Actual hours** (new, optional; the developer fills it in).
   - **Several links** (new; Figma, site, docs, up to 5; https only).
   - **Comments thread** (new).
3. **Views** (phone-first):
   - **List:** filter by client, developer, status and due date (overdue / this week / later / no date).
   - **Board:** a column per status. On a phone, tap a card and pick the new status. On a computer, drag the card to another column. That's built with the browser's own drag-and-drop, with no new package.
   - **My work orders:** each developer's screen (already built, gains the new fields).
   - **Overdue & due this week:** one tap from the badge.
4. **Deadline colors** (plain code, tested): red = due today or late; orange = 1–2 days; yellow = 3–6 days; green = 7+ days or no date.
5. **Change history:** every change of assignee, status, due date, priority, archive or cancel is written **by the database itself** (a trigger) with who, what (old → new) and when. The app can't skip it and nobody can edit or delete it. It shows on each work order.
6. **No hard delete:**
   - **Cancel** (exists, owner only) is for work that won't happen.
   - **Archive** (new, owner only) tidies finished work away from every list; it stays searchable.
   - The database refuses deletes.
7. **"Needs reassignment":** a developer taps it on their own item and writes a reason. You get a notification and a badge, then reassign or dismiss it.
8. **In-app notifications** (bell on Home and Work):
   - Developers are notified when an item is assigned to them, reassigned to or from them, its due date changes, or someone comments.
   - You're notified when a developer asks for reassignment, and when a developer comments.
   - "Due tomorrow" is worked out when they open the app. There's **no scheduled job and nothing that nags**.
   - **Mute:** each person can turn any of these kinds off for themselves.
9. **Privacy warning:** if someone types something that looks like an email address or phone number into a description or comment, a warning shows before saving. It's checked on the server too, using the same patterns the owner summary already blocks. No client contact fields are added; work orders only link to the client record.
10. **AI CEO summary (read-only):** I'll add exactly the metrics, the list and the alerts you listed.
    - The list uses the **developer's first name only**.
    - The "Blocked / Waiting 3+ days" alert uses the new history to know how long. Items from before the change have no history yet, so they won't trigger it.
    - The format, key and access rules are unchanged.
11. **GoHighLevel:** nothing new connects to it. Work orders live only in Atlas and nothing is written to GoHighLevel. The existing optional field where a person *pastes* a GoHighLevel conversation link stays: Atlas never opens it.

## Database changes (one migration, `0017`; you run it in Supabase like before)
- **New columns on work orders:**
  - `start_on`;
  - `actual_minutes` (developer may edit their own);
  - `links` (up to 5 https links);
  - `archived_at` (owner only);
  - `reassign_reason` + `reassign_requested_at` (a developer sets these on their own item, and only the owner clears them).
- **New table `work_order_comments`:** add-only; no edits or deletes. Developers can comment only on their current items.
- **New table `work_order_history`:**
  - written **only** by a database trigger;
  - you and managers read everything;
  - a developer reads only the history of items currently assigned to them.
- **New table `notifications`:** written **only** by database triggers. Each person reads and marks *their own* as read, and nothing else.
- **New table `notification_mutes`:** each person manages only their own.
- **The developer guard** (the database rule that limits what developers can change) is extended:
  - they may change status, ticks, actual hours, the reassignment request and comments on their own items;
  - everything else is still refused.
- Every new table gets the same two-factor rule as all the others. Nothing existing is deleted.

## Who can see and do what (enforced by the database)
| | You (owner) | Managers | Developers |
|---|---|---|---|
| See work orders | All | All | **Only theirs**; gone the moment it's reassigned |
| Create / reassign | Yes | **See question 1** | No |
| Cancel / archive | Yes | No | No |
| Change status, hours, comment | Yes | Yes | Their own only |
| Ask for reassignment | – | – | Their own only |
| Billing / payments | Yes | No | No |
| Delete | Nobody | Nobody | Nobody |

**New break-in tests** (on a throwaway local database) prove that a developer:
- can't read billing data;
- can't see or edit another developer's work order, even by guessing its ID or querying the database directly;
- loses access right after a reassignment;
- can't create, reassign, archive, cancel or delete anything;
- can't read other people's notifications, comments or history.

## Cost
**$0.** It runs on your existing Vercel Pro and Supabase Pro, with no new services, packages or AI.

## Risks (and what limits each)
- **More database rules mean more ways to make a mistake.** Every rule gets a break-in test before anything goes live, and you run the migration only after reviewing it.
- **The developer guard changes.** Tests prove the extra columns don't unlock anything else.
- **History before 0017 doesn't exist:** older items show only the summary lines we already keep.
- **Desktop drag-and-drop:** phones use tap-to-move instead, so nothing depends on dragging.
- **The privacy check is pattern-based:** it catches obvious emails and phone numbers, not everything. It warns, and the server refuses obvious ones in comments.

## Questions (only what I need)
1. **Managers: create and reassign?** Today your managers *can* create and reassign work orders (you approved that on Nov 8; your "Client communication & work orders" person runs them). Your new note says only you can.
   - **Recommended:** keep managers able to create and reassign. Cancel and archive stay owner-only.
   - Alternative: owner only. Then managers can still view and approve reviews, but can't create or reassign.
2. **Developers' other screens:** you said developers shouldn't see "anything outside work orders". Today they also see:
   - their own follow-ups and issues;
   - last-contact *dates* for their clients (no notes or messages);
   - the Kit handbook.
   - **Recommended:** keep all three, since they help them work. Billing and other people's work stay invisible.
   - Alternative: work orders only, which hides the Kit and the contact dates.

## Build order (phase 1)
1. `0017` + break-in tests → you review and run it.
2. Screens: floating button, list/board/filters, colors, the detail page with comments, history, links and hours.
3. Notifications + mute.
4. AI CEO additions.

Each step is its own commit, nothing is pushed without your OK, and I'll stop after each step for you to check on your phone.

## Phase 2 (outline only; built after phase 1 works and you say go)
1. **Templates** (e.g. "New landing page", "Monthly SEO report"): preset title, description, checklist, estimated hours and typical length, so the due date fills itself in. One small table, owner/manager only. $0.
2. **Recurring work orders:** created from a template on a schedule you set, assigned to the usual developer; you can pause or stop each one. Two ways to run it:
   - **(a)** create them when you or a manager opens Atlas each day. $0, no new pieces, but it waits until someone opens the app;
   - **(b)** a nightly Vercel scheduled job. Included in Vercel Pro, but it adds a second server address, which needs its own lock and tests.

   I'd start with (a). Nothing messages clients either way.
3. **Client status page (no login):**
   - **The link:** a long random link per client. Only a fingerprint of it is stored, the same way your AI CEO key works. You can turn it off or replace it, and it expires unless renewed.
   - **What it shows:** that client's work order titles, status and due dates, and at most developers' first names.
   - **Protection:** not indexed by search engines; too many tries get blocked.
   - **Before it goes live:** this is the biggest security step (a public page), so it gets its own security review and your approval.
4. **Request → draft work order in one tap:** this already exists as **Quick add** on Work orders (type, dictate or photo).
   - It uses your existing AI budget (default $10/month, hard stop at 100%); a typical draft costs a few cents.
   - Phase 2 adds a suggested due date from the template's typical length, and a button on each client's page.
   - It never reads GoHighLevel or email.
5. **Email notifications** (only after your OK): Atlas has no email-sending service today; Supabase's built-in email is only for sign-in.
   - **Recommended:** Resend's free plan (3,000 emails/month, 100/day), which is $0 at your size. You'd paste its key into Vercel yourself.
   - Alternative: sending through your Gmail. That's harder to set up safely and needs an app password.
   - The emails would say only "You have a new work order: [title]" with a link, and never client contact details. No texts.
