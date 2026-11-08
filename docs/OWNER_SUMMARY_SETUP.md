# Owner summary: setup (0012)

Your personal dashboard ("AI CEO") reads Atlas's agency totals from
`GET /api/owner-summary`. Atlas saves the totals while you're signed in; the dashboard
reads only that saved summary, with its key. It can't read anything else, change
anything, sync GoHighLevel or run the AI.

## 1. Make the key (on your Mac, in Terminal)

This makes a random key and saves it in a file only you can read:

```bash
openssl rand -hex 32 > ~/atlas-dashboard-key.txt && chmod 600 ~/atlas-dashboard-key.txt
```

Print the key's **fingerprint** (safe to share; it can't be turned back into the key):

```bash
printf %s "$(cat ~/atlas-dashboard-key.txt)" | shasum -a 256 | cut -d' ' -f1
```

## 2. Give Atlas the fingerprint (twice)

1. **Vercel:** Project → Settings → Environment Variables → add
   `OWNER_SUMMARY_TOKEN_SHA256` = the fingerprint (Production). Redeploy.
2. **Supabase:** run `supabase/migrations/0012_owner_summary.sql` in the SQL Editor
   (once), then this line with your fingerprint:

   ```sql
   insert into private.owner_summary_key (id, token_sha256) values (1, 'PASTE-FINGERPRINT-HERE')
   on conflict (id) do update set token_sha256 = excluded.token_sha256, updated_at = now();
   ```

Both must match. If they don't, the dashboard gets 401.

## 3. Give the dashboard the key

Put the key (the contents of `~/atlas-dashboard-key.txt`) in the dashboard's own
settings (its `.env` file or the macOS Keychain, never in Git). It calls:

```
GET https://agency-atlas-gules.vercel.app/api/owner-summary
Authorization: Bearer <key>
```

Then delete `~/atlas-dashboard-key.txt` if you like.

## 4. Publish

Open Atlas's Home (it publishes at most once an hour on its own), or press
**Publish now** on the Data Safety screen. Data Safety also shows when your dashboard
last read it.

## Answers

| Code | Meaning |
|---|---|
| 200 | The latest summary (see `generated_at` for its age) |
| 401 | Missing or wrong key (or the two fingerprints don't match) |
| 404 | Feature off: `OWNER_SUMMARY_TOKEN_SHA256` isn't set |
| 429 | Too many reads: more than 30 in 10 minutes (wait and retry) |
| 503 | Nothing published yet, or the database can't be reached |

## Change or turn off the key

- **New key:** repeat steps 1–3 (the SQL line replaces the old fingerprint).
- **Turn off:** remove `OWNER_SUMMARY_TOKEN_SHA256` in Vercel and redeploy (404).

## What's in it (and what never is)

Weekly totals (12 Monday weeks, New York time), at-risk and win-back client names,
overdue/blocked counts by person, alert counts and AI bot status. Never: emails,
phone numbers, addresses, message text, notes, work order titles or record ids.
`null` means Atlas doesn't know or doesn't track it (never a hidden 0).

Client names are real names. If your dashboard sends this data to an AI service,
ask for the coded-names version first.
