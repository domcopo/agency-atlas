-- Agency Atlas Phase 4: AI usage log, monthly budget, and saved AI results.
--
-- Run ONCE in the Supabase SQL Editor (after 0001-0004).
--
-- The AI never writes here itself. The app's server records each request's
-- tokens and cost, and saves the AI's text answers for people to review.
-- Nothing can be deleted; the usage log can't be edited.

begin;

-- One row per AI request: what it cost.
create table public.ai_usage (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  requested_by  uuid not null default auth.uid() references auth.users (id),
  feature       text not null check (feature in ('briefing', 'client_profile')),
  model         text not null check (char_length(model) <= 60),
  input_tokens  integer not null check (input_tokens >= 0),
  output_tokens integer not null check (output_tokens >= 0),
  cache_read_tokens  integer not null default 0 check (cache_read_tokens >= 0),
  cache_write_tokens integer not null default 0 check (cache_write_tokens >= 0),
  cost_usd      numeric(10, 4) not null check (cost_usd >= 0 and cost_usd < 100),
  outcome       text not null check (outcome in ('ok', 'refused', 'error'))
);
create index ai_usage_month_idx on public.ai_usage (created_at desc);

-- The monthly budget. Exactly one row (id = 1).
create table public.ai_settings (
  id                 integer primary key default 1 check (id = 1),
  monthly_budget_usd numeric(8, 2) not null default 10 check (monthly_budget_usd between 0 and 500),
  updated_at         timestamptz not null default now(),
  updated_by         uuid references auth.users (id)
);
insert into public.ai_settings (id, monthly_budget_usd) values (1, 10);

-- Saved briefings (history).
create table public.ai_briefings (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users (id),
  kind       text not null check (kind in ('daily')),
  content    jsonb not null check (octet_length(content::text) <= 60000)
);

-- Client knowledge profiles drafted by the AI. A new row each refresh (history);
-- the owner can mark one reviewed, nothing else can change.
create table public.ai_client_profiles (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients (id) on delete restrict,
  created_at  timestamptz not null default now(),
  created_by  uuid not null default auth.uid() references auth.users (id),
  content     jsonb not null check (octet_length(content::text) <= 30000),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id)
);
create index ai_client_profiles_client_idx on public.ai_client_profiles (client_id, created_at desc);

-- Permissions: start from nothing, then grant only what's needed.
revoke all on public.ai_usage, public.ai_settings, public.ai_briefings, public.ai_client_profiles
  from public, anon, authenticated;
grant select, insert on public.ai_usage to authenticated;
grant select on public.ai_settings to authenticated;
grant update (monthly_budget_usd, updated_at, updated_by) on public.ai_settings to authenticated;
grant select, insert on public.ai_briefings to authenticated;
grant select, insert on public.ai_client_profiles to authenticated;
grant update (reviewed_at, reviewed_by) on public.ai_client_profiles to authenticated;

alter table public.ai_usage           enable row level security;
alter table public.ai_settings        enable row level security;
alter table public.ai_briefings       enable row level security;
alter table public.ai_client_profiles enable row level security;

-- Owner and managers read everything here, and can use the AI (as themselves).
create policy ai_usage_read on public.ai_usage for select to authenticated
  using ((select private.my_role()) in ('owner', 'manager'));
create policy ai_usage_insert on public.ai_usage for insert to authenticated
  with check ((select private.my_role()) in ('owner', 'manager') and requested_by = (select auth.uid()));

create policy ai_settings_read on public.ai_settings for select to authenticated
  using ((select private.my_role()) in ('owner', 'manager'));
create policy ai_settings_update on public.ai_settings for update to authenticated
  using ((select private.my_role()) = 'owner')
  with check ((select private.my_role()) = 'owner');

create policy ai_briefings_read on public.ai_briefings for select to authenticated
  using ((select private.my_role()) in ('owner', 'manager'));
create policy ai_briefings_insert on public.ai_briefings for insert to authenticated
  with check ((select private.my_role()) in ('owner', 'manager') and created_by = (select auth.uid()));

create policy ai_profiles_read on public.ai_client_profiles for select to authenticated
  using ((select private.my_role()) in ('owner', 'manager'));
create policy ai_profiles_insert on public.ai_client_profiles for insert to authenticated
  with check ((select private.my_role()) in ('owner', 'manager') and created_by = (select auth.uid()));
create policy ai_profiles_review on public.ai_client_profiles for update to authenticated
  using ((select private.my_role()) = 'owner')
  with check ((select private.my_role()) = 'owner');

-- Two-factor required, like every other table.
create policy ai_usage_requires_2fa on public.ai_usage as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');
create policy ai_settings_requires_2fa on public.ai_settings as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');
create policy ai_briefings_requires_2fa on public.ai_briefings as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');
create policy ai_profiles_requires_2fa on public.ai_client_profiles as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

commit;
