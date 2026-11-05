# Phase 5 setup: put Agency Atlas online for your team

About 1.5–2 hours, in order. You do these steps yourself: keys and passwords never go
in chat. Plan: **you and the managers first**, developers the next day.

What it costs: Vercel Pro (about $20/month) + Supabase Pro ($25/month) + AI (capped at
$10/month in the app and in your Anthropic account).

---

## 1. Supabase Pro (daily backups) · 3 min

Supabase → your organization → **Billing** → upgrade to **Pro**.
Then: **Database → Backups** should show daily backups.

## 2. Run the new database file · 2 min

Supabase → **SQL Editor** → **New query** → paste everything from
`supabase/migrations/0007_team_logins_and_developer_view.sql` → **Run** → "Success".

It only adds things (a link from each login to a team member, and the developer view).
Nothing existing is changed or deleted. If Supabase's **Advisors** later mention a
"security definer view" called `my_work`, that's expected (see the comment in the file).

## 3. Link your own login to your team profile · 1 min

So My Work opens to *your* list. In the SQL Editor (put your name exactly as it appears
on the Work tab's team list):

```sql
update public.team_members
set staff_id = (select id from public.staff where name = 'Your name as on the team list')
where role = 'owner';
```

It should say "1 row". "0 rows" = the name didn't match exactly.

## 4. Put the code on GitHub, privately · 15 min

The easiest way is **GitHub Desktop** (free app: desktop.github.com).

1. Open GitHub Desktop → sign in to GitHub.
2. **File → Add Local Repository** → choose the `Agency AI` folder on your Desktop.
3. Click **Publish repository**. Name: `agency-atlas`.
   **Keep "Keep this code private" ticked.** Then **Publish**.

What gets uploaded: only committed code. Your `.env.local` (keys) and anything private
is excluded by `.gitignore` and was checked before every commit.

## 5. Create the Vercel project · 15 min

1. vercel.com → sign in with GitHub → make sure your team is on **Pro**.
2. **Add New… → Project** → pick `agency-atlas` → **Import**.
3. Framework: **Next.js** (detected). Leave build settings as they are.
4. Open **Environment Variables** and add these 5, one by one. Copy each value from
   your `.env.local` (open it yourself with `open -e .env.local` in the project folder):

   | Name | Where it comes from |
   |---|---|
   | `SUPABASE_URL` | same line in `.env.local` |
   | `SUPABASE_PUBLISHABLE_KEY` | same line in `.env.local` |
   | `GHL_READONLY_TOKEN` | same line in `.env.local` |
   | `GHL_LOCATION_ID` | same line in `.env.local` |
   | `ANTHROPIC_API_KEY` | same line in `.env.local` |

   Never add a name starting with `NEXT_PUBLIC_`, and never a Supabase **secret** key.
5. **Deploy.** After a minute or two you get an address like
   `https://agency-atlas-xxxx.vercel.app`. Write it down.
6. Project → **Settings → Deployment Protection**: keep protection **on for Preview**
   deployments (the default). The main (Production) address stays reachable so your team
   can sign in.

## 6. Tell Supabase the new address · 3 min

Supabase → **Authentication → URL Configuration**:
- **Site URL**: your Vercel address (e.g. `https://agency-atlas-xxxx.vercel.app`)
- **Redirect URLs**: add the same address.

Supabase → **Authentication → Sign In / Providers**: make sure **"Allow new users to
sign up" is OFF**. Only you add people.

## 7. Try it yourself first · 10 min

Open the Vercel address on your phone. Sign in → enter your two-factor code.
Check: Home, Clients, a client page, Sales, Work. Press **Sync from GoHighLevel** on Data
Safety once. Tell Claude "it's live" and the address, and Claude checks it too.

## 8. Add a manager · 5 min each

1. Supabase → **Authentication → Users → Add user → Create new user**.
   Email: theirs. Password: a **temporary** one (16+ characters, e.g. four random words).
   Tick **Auto Confirm User**. Create.
2. SQL Editor (fill in their email, first name, and their name exactly as on the team list):

   ```sql
   insert into public.team_members (user_id, display_name, role, staff_id)
   select u.id, 'First name', 'manager', s.id
   from auth.users u, public.staff s
   where u.email = 'their@email.com' and s.name = 'Their name as on the team list';
   ```

   It should say "1 row".
3. Send them the address and the temporary password **privately**: in person, a phone
   call, or a password manager share. Not a group chat, not email with the address.
4. On first sign-in they: install an authenticator app (Google Authenticator, Microsoft
   Authenticator or 1Password) → scan the QR code → then **Account → Change password**.

## 9. Developers (next day) · 5 min each

Same as step 8, with `'developer'` instead of `'manager'`. Before inviting the rest:
sign one developer in, and together confirm they see **only their own items** on Home
and Work, and that Clients, Sales and Growth say "not part of the developer view".

Developers only see items **assigned to them**, so assign their issues first
(a client's page → Next actions & issues → Assign).

---

## Go-live checklist

- [ ] Supabase Pro on; Backups page shows a backup
- [ ] 0007 ran ("Success"); your login linked (step 3)
- [ ] GitHub repository is **Private**
- [ ] Vercel has the 5 settings; nothing starts with `NEXT_PUBLIC_`
- [ ] Supabase Site URL + Redirect URL = the Vercel address; public sign-ups OFF
- [ ] You signed in on your phone with two-factor; screens look right
- [ ] Each person got their temporary password privately and changed it
- [ ] Anthropic account has a $10 monthly spend limit (second lock)

## Updating the app later

Claude commits changes on this Mac. You open GitHub Desktop → **Push origin**. Vercel
publishes the new version in about a minute.

## If something goes wrong

- **Undo a bad update:** Vercel → project → **Deployments** → pick the last good one →
  **Instant Rollback** / **Promote to Production**.
- **Remove someone's access right away** (SQL Editor):
  `delete from public.team_members where user_id = (select id from auth.users where email = 'their@email.com');`
  They can't see anything after that, even if signed in. (Also Supabase → Users → their
  account → **Ban user** if you want to block sign-in itself.)
- **Lock the whole app to just you:** Vercel → project → **Settings → Deployment
  Protection** → Vercel Authentication → **All Deployments**. Only people on your Vercel
  team can open it. Nothing in GoHighLevel or Supabase is affected.
- **Lost phone / two-factor:** SQL Editor:
  `delete from auth.mfa_factors where user_id = (select id from auth.users where email = 'their@email.com');`
  They set it up again on their next sign-in.
