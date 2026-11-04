-- Agency Atlas: tables and security rules (Phase 2).
--
-- How to apply: paste this whole file into Supabase → SQL Editor → Run, on the
-- NEW project made only for Agency Atlas. Safe to run once on an empty project.
--
-- Security model, in plain words:
-- * Nobody signed out ("anon") can read or change anything.
-- * Only people listed in team_members can use the app, with a role:
--     owner     – everything (and is the only role that can change client records)
--     manager   – read clients, log check-ins, answer Atlas asks
--     developer – nothing here yet (their work orders arrive in Phase 3)
-- * Every table has row-level security (RLS) turned on, and table permissions are
--   set explicitly instead of relying on Supabase's defaults.
-- * Nothing can be deleted through the app. Corrections are new rows (history).
-- * No GoHighLevel data or keys live here yet (Phase 3).

begin;

-- ---------------------------------------------------------------------------
-- Private helper schema: NOT exposed through Supabase's API.
-- ---------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------
-- Who may use the app. Rows are added by hand in the SQL Editor (see SETUP).
-- ---------------------------------------------------------------------------
create table public.team_members (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  role         text not null check (role in ('owner', 'manager', 'developer')),
  created_at   timestamptz not null default now()
);

-- The signed-in person's role, or null. "security definer" lets the rules below
-- look this up without opening team_members to everyone.
create or replace function private.my_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.team_members where user_id = auth.uid()
$$;
revoke all on function private.my_role() from public, anon;
grant execute on function private.my_role() to authenticated;

-- ---------------------------------------------------------------------------
-- Clients (the agency's customers).
-- ---------------------------------------------------------------------------
create table public.clients (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique check (slug ~ '^[a-z0-9-]{1,90}$'),
  name         text not null check (char_length(name) between 1 and 80),
  monthly_usd  numeric(10, 2) not null check (monthly_usd between 0 and 100000),
  start_date   date not null,
  status       text not null check (status in ('active', 'paused', 'canceled', 'incomplete_expired')),
  services     text[] not null default '{}' check (services <@ array['SEO', 'Ads', 'Website']),
  listed_in    text[] not null default '{}',
  check_note   text check (char_length(check_note) <= 300),
  follow_up    text check (char_length(follow_up) <= 120),
  end_date     date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Staff list for the Work tab (not app logins; developers may never sign in).
create table public.staff (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique check (char_length(name) between 1 and 40),
  role       text not null check (role in ('founder', 'client_comms', 'client_manager', 'seo_developer')),
  handles    text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- Check-in log: one row each time someone talks to a client.
create table public.check_ins (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients (id) on delete restrict,
  happened_on date not null check (happened_on > date '2020-01-01'),
  note        text check (char_length(note) <= 500),
  logged_by   uuid not null default auth.uid() references auth.users (id),
  created_at  timestamptz not null default now()
);
create index check_ins_client_idx on public.check_ins (client_id, happened_on desc);

-- Atlas asks: every answer, skip or "later" is kept as history.
create table public.atlas_answers (
  id           uuid primary key default gen_random_uuid(),
  question_key text not null check (char_length(question_key) between 1 and 120),
  client_id    uuid references public.clients (id) on delete restrict,
  status       text not null check (status in ('answered', 'skipped', 'later')),
  answer       text check (char_length(answer) <= 500),
  answered_by  uuid not null default auth.uid() references auth.users (id),
  created_at   timestamptz not null default now()
);
create index atlas_answers_key_idx on public.atlas_answers (question_key, created_at desc);

-- Keep updated_at honest.
create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger clients_touch before update on public.clients
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Table permissions: start from nothing, then grant only what's needed.
-- (RLS below then decides which ROWS each person can see.)
-- ---------------------------------------------------------------------------
revoke all on public.team_members, public.clients, public.staff, public.check_ins, public.atlas_answers
  from public, anon, authenticated;

grant select on public.team_members to authenticated;
grant select, insert, update on public.clients to authenticated;
grant select, insert, update on public.staff to authenticated;
grant select, insert on public.check_ins to authenticated;
grant select, insert on public.atlas_answers to authenticated;

-- ---------------------------------------------------------------------------
-- Row-level security.
-- ---------------------------------------------------------------------------
alter table public.team_members  enable row level security;
alter table public.clients       enable row level security;
alter table public.staff         enable row level security;
alter table public.check_ins     enable row level security;
alter table public.atlas_answers enable row level security;

-- team_members: you see yourself; the owner sees everyone. Changes only via SQL Editor.
create policy team_read on public.team_members for select to authenticated
  using (user_id = (select auth.uid()) or (select private.my_role()) = 'owner');

-- clients: owner and managers read; only the owner adds or edits.
create policy clients_read on public.clients for select to authenticated
  using ((select private.my_role()) in ('owner', 'manager'));
create policy clients_insert on public.clients for insert to authenticated
  with check ((select private.my_role()) = 'owner');
create policy clients_update on public.clients for update to authenticated
  using ((select private.my_role()) = 'owner')
  with check ((select private.my_role()) = 'owner');

-- staff: owner and managers read; only the owner edits.
create policy staff_read on public.staff for select to authenticated
  using ((select private.my_role()) in ('owner', 'manager'));
create policy staff_insert on public.staff for insert to authenticated
  with check ((select private.my_role()) = 'owner');
create policy staff_update on public.staff for update to authenticated
  using ((select private.my_role()) = 'owner')
  with check ((select private.my_role()) = 'owner');

-- check_ins: owner and managers read and log, always as themselves.
create policy check_ins_read on public.check_ins for select to authenticated
  using ((select private.my_role()) in ('owner', 'manager'));
create policy check_ins_insert on public.check_ins for insert to authenticated
  with check ((select private.my_role()) in ('owner', 'manager') and logged_by = (select auth.uid()));

-- atlas_answers: same as check-ins.
create policy atlas_read on public.atlas_answers for select to authenticated
  using ((select private.my_role()) in ('owner', 'manager'));
create policy atlas_insert on public.atlas_answers for insert to authenticated
  with check ((select private.my_role()) in ('owner', 'manager') and answered_by = (select auth.uid()));

commit;
