# Phase 2 setup: connect Agency Atlas to Supabase

About 10 minutes. You do these steps yourself in the Supabase website and on this Mac.
Claude never sees your password or keys.

## 1. Make a NEW project (don't reuse one)

1. Go to supabase.com → your dashboard → **New project**.
2. Name: `agency-atlas`. Pick the region closest to you.
3. Database password: click **Generate**, then save it in your password manager.
   You won't need it day to day.
4. Wait for the project to finish setting up (a minute or two).

Why a new project: your other apps' data stays completely separate, so a mistake in
one app can't expose the other. (Free plans allow 2 active projects. If you're at the
limit, pause an unused one or tell Claude and we'll pick another option.)

## 2. Create the tables and security rules

1. In the new project: **SQL Editor** → **New query**.
2. Open `supabase/migrations/0001_agency_atlas.sql` from this folder, copy everything,
   paste it in, and click **Run**. You should see "Success. No rows returned".

Run it once. (Running it again will say the tables already exist. That's harmless.)

## 3. Lock down sign-ups

1. **Authentication** → **Sign In / Providers** (or **Settings**).
2. Turn **off** "Allow new users to sign up".
3. Make sure **Email** sign-in is on.

Now only people you add by hand can ever have an account.

## 4. Add yourself

1. **Authentication** → **Users** → **Add user** → **Create new user**.
2. Your email and a strong password (save it in your password manager).
   Tick **Auto Confirm User**.
3. **SQL Editor** → New query → paste this, put in YOUR email and name, and run it:

```sql
insert into public.team_members (user_id, display_name, role)
select id, 'Your name', 'owner'
from auth.users
where email = 'you@example.com';
```

It should say "1 row" inserted. If it says 0, the email didn't match exactly.

## 5. Connect this Mac to the project

1. **Project Settings** → **API Keys**. Copy the **Publishable key** (starts with
   `sb_publishable_`). **Not** the secret key.
2. **Project Settings** → **Data API** (or the Connect button). Copy the **Project URL**
   (looks like `https://abcdefgh.supabase.co`).
3. On this Mac, open Terminal and run:

```bash
cd ~/Desktop/"Agency AI" && touch .env.local && open -e .env.local
```

4. In the window that opens, paste these two lines, then **replace the example values with
   your real ones** (the project ID in the URL is 20 letters). No quote marks. An address
   copied with `/` or `/rest/v1/` on the end is fine; the app trims it. Save and close:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Git ignores `.env.local`, and a test fails if it's ever tracked. The publishable key is
designed to be safe to use from apps. The database's security rules are what protect
the data.

## 6. Tell Claude "done"

Claude restarts the app. Then you:

1. Open http://localhost:3200 and sign in.
2. Tap the shield (Data Safety) → **Import client list from this Mac**.
3. Check the Clients tab matches what you expect (33 clients, $5,445/mo active).
4. Ask Claude to delete the private file from this Mac. Your data now lives in Supabase.

## Recommended before relying on it daily

- **Supabase Pro ($25/month)** for daily backups. Free projects also pause after a week
  without use.
- Turn on **two-factor authentication** for your Supabase account (Account → Security).
