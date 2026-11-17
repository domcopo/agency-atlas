# Giving a team member a login

Only the owner adds people, by hand, in Supabase. The app itself can't create accounts
(it has no admin key on purpose). Sign-ups from the public are turned off.

## Pick a role first

| Role | Can see | Can do |
|---|---|---|
| **owner** | Everything | Edit clients, import, sync GoHighLevel |
| **manager** | All clients, health, check-ins, pipeline | Log check-ins, answer Atlas asks |
| **developer** | Their own work orders, issues and follow-ups; contact dates of their clients; Kit pages for developers | Update status, tick steps, comment |
| **sales** | Open leads in the Sales pipelines (no phones or emails), GoHighLevel user names, their own target, lead follow-ups, Kit pages for sales | Log reach-outs, add/finish lead follow-ups, Refresh leads |

Rule of thumb: people who talk to clients → **manager**. SEO developers → **developer**.
Salespeople → **sales** (then link them to their GoHighLevel user and set a target in
Sales → Setup).

The database enforces these roles. Hiding a button is not what protects the data.

## Add a person (about 3 minutes each)

1. Supabase → **Authentication** → **Users** → **Add user** → **Create new user**.
   Their email + a strong temporary password. Tick **Auto Confirm User**.
2. Give them the password in person or by phone call. Not by email or text.
3. **SQL Editor** → **New query**, fill in the three values, **Run**:

```sql
insert into public.team_members (user_id, display_name, role, staff_id)
select u.id, 'First name', 'manager',
       (select s.id from public.staff s where s.name = 'Their name as on the team list')
from auth.users u
where lower(u.email) = 'their@email.com';
```

It should say **1 row**. (Role must be exactly `manager`, `developer` or `sales`.)
`staff_id` links the login to their team-list entry: developers need it to see their
own work, and managers need it for "My Work".

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

## Where they sign in

Atlas is hosted (Phase 5): send them the app address privately. It works on any phone or
computer. On first sign-in they set up two-factor, then change the temporary password
under **Account**.
