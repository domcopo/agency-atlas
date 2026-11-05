# Phase 6 setup: automatic call & message times (read-only, times only)

About 15 minutes. What it does: when you press **Sync** on Data Safety, the app also
reads *when* each matched client was last called or messaged in GoHighLevel, and in
which direction. "Last contact" then updates by itself. It never reads or stores
message text, recordings, transcripts, emails or phone numbers, and it still can't
change anything in GoHighLevel.

## 1. GoHighLevel permissions (done)

Your private integration needs **View Conversations** and **View Conversation
Messages** (both read-only). The token stays the same.

## 2. Run the database file · 2 min

Supabase → **SQL Editor** → **New query** → paste everything from
`supabase/migrations/0008_ghl_contact_times.sql` → **Run** → "Success".
Only adds two tables; nothing existing changes.

## 3. Publish the new version · 1 min

GitHub Desktop → **Push origin**. Vercel publishes it in about a minute.

## 4. First sync · 1–2 min

Live app → shield (Data Safety) → **Sync from GoHighLevel**. The message now also
says how many clients' times were read and how many match suggestions were made.
The first run takes longer (it pauses between requests to respect GoHighLevel's limits).

## 5. Confirm matches · ~10 min, once

Clients tab → **Match clients to GoHighLevel contacts**. For each client:
- **Yes** on the right contact (the app reads that client's times right away), or
- **No** on wrong ones, or
- **Link by contact ID** if there's no suggestion: open the contact in GoHighLevel;
  the ID is the last part of the address (…/contacts/detail/**THIS-PART**).

Then press **Sync** once more. Spot-check 2–3 clients against GoHighLevel.

## What changes on screen

- **Last contact** = the newest of: what the team logged, or a call/message either way.
- New flags: **"Client reached out N days ago; no reply yet"** (needs attention at 2
  days, at risk at 4) and **"3 messages from us with no reply: try a call"**.
- Today's priorities: **"Reply to [client]"** when someone's waiting.
- Client page: when they last reached out, when we did, last call and its length.

## Who sees it

Owner and managers. Developers and signed-out visitors see nothing (break-in tested).
Only the owner can sync or change matches.
