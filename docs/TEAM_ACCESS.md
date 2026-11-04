# Giving a team member a login

Only the owner adds people, by hand, in Supabase. The app itself can't create accounts
(it has no admin key on purpose). Sign-ups from the public are turned off.

## Pick a role first

| Role | Can see | Can do |
|---|---|---|
| **owner** | Everything | Edit clients, import, sync GoHighLevel |
| **manager** | All clients, health, check-ins, pipeline | Log check-ins, answer Atlas asks |
| **developer** | Nothing yet (the Work tab still uses sample data) | Nothing yet |

Rule of thumb: people who talk to clients → **manager**. SEO developers → **developer**
for now. They'll get their own work list when work orders become real.

The database enforces these roles. Hiding a button is not what protects the data.

## Add a person (about 3 minutes each)

1. Supabase → **Authentication** → **Users** → **Add user** → **Create new user**.
   Their email + a strong temporary password. Tick **Auto Confirm User**.
2. Give them the password in person or by phone call. Not by email or text.
3. **SQL Editor** → **New query**, fill in the three values, **Run**:

```sql
insert into public.team_members (user_id, display_name, role)
select id, 'First name', 'manager'
from auth.users
where email = 'their@email.com';
```

It should say **1 row**. (Role must be exactly `manager` or `developer`.)

4. On their first sign-in, the app makes them set up two-factor on their phone.

## Remove a person

SQL Editor:

```sql
delete from public.team_members
where user_id = (select id from auth.users where email = 'their@email.com');
```

That alone blocks all data immediately: the database only shows data to people on the
team list. Their check-in history stays (it records who logged what), which is also why
Supabase may refuse to fully delete a user who logged check-ins. That's expected.

## Important for now

The app runs **only on this Mac** (http://localhost:3200). Until hosting (Phase 5),
team members can only use it here, on this computer. Their accounts will work
unchanged once it's hosted.
