# Plan: Trash (move old clients and work orders out of the way; only the owner deletes forever)

Status: **approved and built 2026-11-12.** `0019` was run in Supabase on 2026-11-12. Screens: `/trash`, plus "Move to Trash…" on work order and client pages.

## What you asked for
- A way to remove old clients, work orders and other items.
- They go to a **Trash** section first, not straight to "gone".
- **Only you (the owner) can delete something from Trash for good**, so you can review it first.

## How it fits with what exists
Atlas has refused all deletes so far, on purpose: nothing could disappear by accident. There are already two "put it away" options:

| | What it's for | Who | Comes back? |
|---|---|---|---|
| **Cancel** (exists) | Work that won't happen | Owner | Yes (restore) |
| **Archive** (exists) | Finished work, tidied out of lists | Owner | Yes |
| **Trash** (new) | Mistakes, duplicates, test items, old junk | See question 1 | Yes, until you delete it for good |
| **Delete forever** (new) | Emptying Trash | **Owner only** | **No** (except from Supabase's daily backup, kept 7 days) |

**Ex-clients should not go to Trash.** Mark them **Ended** as today. Your AI CEO numbers ("clients lost", "lost monthly value", win-back list) need them. Trash is for things that should never have been in Atlas.

## What can go to Trash
1. **Work orders, follow-ups and issues.**
2. **Clients.** A trashed client takes its whole folder with it: its work orders, check-ins, timeline, AI profile, health history, GoHighLevel link and billing matches. All of it hides together and comes back together.

## What Trash does
- **Trashing hides the item everywhere:** lists, Home, counts, health scores, the AI briefing, the AI CEO summary, and developers' screens. It is kept as it was, with **who trashed it and when**.
- **The Trash screen** (from Data Safety, plus a small Trash link on Work Orders):
  - lists each item with its type, name and when it was trashed;
  - **Restore** puts it back exactly as it was;
  - **Delete forever (owner only)** asks you to type `DELETE` to confirm, then removes the item and everything attached to it (comments, history, notices, check-ins…).
- **Nothing empties Trash automatically.** Items wait until you decide. (We could add "remind me after 30 days" later; it's not part of this plan.)
- **A small deletion record** keeps what type was deleted, by whom and when, but **not the name or contents**. You can see that something was deleted without keeping the data.
- **GoHighLevel is untouched:** deleting in Atlas never deletes in GoHighLevel. A client still in GoHighLevel can appear again as a *suggestion* to match, never on its own.

## Enforced by the database (not by hiding buttons)
- **Developers:** can't trash, restore, see Trash or delete. Their screens never show trashed items. Break-in tests check this.
- **Delete forever:** the database refuses a delete unless the person is the **owner** and the item is **already in Trash**. Every other delete is still refused, as today.
- **Delete forever is done in one database step.** The app sends one owner-only delete, and the database removes the attached records with it. Nothing is half-deleted, and the history tables stay add-only for everyone else.
- **New break-in tests:**
  - managers and developers can't delete anything;
  - the owner can't delete something that isn't in Trash;
  - trashed items vanish from developers' screens;
  - Restore brings everything back;
  - the deletion record holds no names.

## Questions (only what I need)
1. **Who can move things to Trash?**
   - **Recommended: you and managers.** Managers can also restore. Only you delete forever.
   - Alternative: only you can trash.
2. **Clients in Trash:** OK that trashing a client takes its whole folder with it (work orders, check-ins, etc.)?
   - **Recommended: yes.** Atlas will block it while the client has a confirmed billing match, so money records can't vanish by accident.

## Cost and risks
- **Cost:** $0. No new services or packages.
- **Risk: deleting forever is permanent.** It's owner-only, needs a typed confirmation, works only from Trash, and Supabase keeps 7 days of daily backups.
- **Risk: this changes Atlas's "no deletes" rule.** I'll update the project rules to "no deletes except owner-only from Trash", and the tests will pin that to exactly one path.
- **Risk: trashed items left showing somewhere.** Every list, count, summary and developer view gets a "not in Trash" filter, with tests on the main ones (Home, Work, Clients, AI CEO, developers).

## Build order (each step stops for your check)
1. Database step `0019` (Trash columns, owner-only delete rule, deletion record) plus break-in tests. You review it and run it in Supabase.
2. Screens:
   - "Move to Trash" on work orders and clients;
   - the Trash screen with Restore and Delete forever;
   - filters everywhere.
3. You try it on your phone with a test item.
