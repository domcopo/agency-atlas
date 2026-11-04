# Phase 3 setup: connect GoHighLevel (read-only)

About 10 minutes. You do these steps yourself. Claude never sees the token.

Before you start: two-factor must be on (Phase 2 setup, step 7).

## 1. Create a READ-ONLY token in your agency's own sub-account

1. In GoHighLevel, switch to **your agency's own sub-account** (the one with your sales
   pipeline), not the agency view and not a client's sub-account.
2. Go to **Settings** → **Private Integrations** → **Create new integration**.
   (If you don't see it, an agency admin may need to turn on Private Integrations.)
3. Name: `Agency Atlas (read-only)`. Description: `Reads pipeline and appointments only.`
4. Scopes: tick **only these four** and nothing else:
   - `View Opportunities` (`opportunities.readonly`)
   - `View Calendars` (`calendars.readonly`)
   - `View Calendar Events` (`calendars/events.readonly`)
   - `View Locations` (`locations.readonly`)

   Don't tick anything that says Edit, Write, Create, Delete or that doesn't end in
   `.readonly`. The app can only read anyway, but the token is the second lock.
5. Create it and **copy the token** (starts with `pit-`). Treat it like a password:
   don't paste it in chat, email or screenshots.
6. Find your **Location ID**: **Settings** → **Business Profile**. It's a code of letters
   and numbers (often near the top or under "General").

## 2. Add both to this Mac

In Terminal:

```bash
cd ~/Desktop/"Agency AI" && open -e .env.local
```

Add two new lines **under** the Supabase lines (keep those), then save with Cmd+S:

```
GHL_READONLY_TOKEN=pit-...
GHL_LOCATION_ID=...
```

No quote marks, no spaces.

## 3. Create the copy tables in Supabase

**SQL Editor** → **New query** → paste everything from
`supabase/migrations/0003_ghl_read_only_copies.sql` → **Run**. Should say "Success".

## 4. Tell Claude "done"

Claude rebuilds the app. Then you open **Data Safety** (shield on Home) and press
**Sync from GoHighLevel (read-only)**. The Sales tab then shows **Your pipeline**.

## If something goes wrong

- **401**: the token was copied wrong. Copy it again.
- **403**: a read-only scope is missing. Edit the integration and tick it.
- **Want to cut it off?** Delete the integration in GoHighLevel (Settings → Private
  Integrations). The app stops reading immediately. Nothing in GHL was ever changed by
  this app, so there's nothing to undo there.
