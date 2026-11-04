-- Agency Atlas Phase 3: read-only COPIES of GoHighLevel data.
--
-- Run ONCE in the Supabase SQL Editor (after 0001 and 0002).
--
-- These tables hold what the "Sync from GoHighLevel" button reads. Nothing here is
-- ever sent back to GoHighLevel. Kept small on purpose: pipeline names, stages,
-- values and dates, appointment times and status. No phone numbers, emails,
-- addresses or message text.

begin;

-- Opportunities from the agency's own GHL pipeline.
create table public.ghl_opportunities (
  ghl_id            text primary key check (ghl_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  name              text check (char_length(name) <= 200),
  pipeline_name     text check (char_length(pipeline_name) <= 100),
  stage_name        text check (char_length(stage_name) <= 100),
  status            text not null check (status in ('open', 'won', 'lost', 'abandoned')),
  monetary_value    numeric(12, 2) check (monetary_value >= 0),
  source            text check (char_length(source) <= 100),
  ghl_created_at    timestamptz,
  ghl_updated_at    timestamptz,
  status_changed_at timestamptz,
  synced_at         timestamptz not null default now()
);

-- Appointments (30 days back to 30 days ahead at each sync). No titles: they often
-- contain people's names.
create table public.ghl_appointments (
  ghl_id         text primary key check (ghl_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  calendar_name  text check (char_length(calendar_name) <= 100),
  status         text check (char_length(status) <= 20),
  starts_at      timestamptz,
  ends_at        timestamptz,
  ghl_created_at timestamptz,
  synced_at      timestamptz not null default now()
);

-- One row per sync, as history.
create table public.ghl_syncs (
  id            uuid primary key default gen_random_uuid(),
  ran_at        timestamptz not null default now(),
  ran_by        uuid not null default auth.uid() references auth.users (id),
  location_name text check (char_length(location_name) <= 100),
  opportunities integer not null check (opportunities >= 0),
  appointments  integer not null check (appointments >= 0)
);

-- Permissions: start from nothing, grant only what the sync and screens need.
revoke all on public.ghl_opportunities, public.ghl_appointments, public.ghl_syncs
  from public, anon, authenticated;
grant select, insert, update on public.ghl_opportunities to authenticated;
grant select, insert, update on public.ghl_appointments to authenticated;
grant select, insert on public.ghl_syncs to authenticated;

alter table public.ghl_opportunities enable row level security;
alter table public.ghl_appointments  enable row level security;
alter table public.ghl_syncs         enable row level security;

-- Owner and managers read; only the owner's sync writes.
create policy ghl_opps_read on public.ghl_opportunities for select to authenticated
  using ((select private.my_role()) in ('owner', 'manager'));
create policy ghl_opps_insert on public.ghl_opportunities for insert to authenticated
  with check ((select private.my_role()) = 'owner');
create policy ghl_opps_update on public.ghl_opportunities for update to authenticated
  using ((select private.my_role()) = 'owner')
  with check ((select private.my_role()) = 'owner');

create policy ghl_appts_read on public.ghl_appointments for select to authenticated
  using ((select private.my_role()) in ('owner', 'manager'));
create policy ghl_appts_insert on public.ghl_appointments for insert to authenticated
  with check ((select private.my_role()) = 'owner');
create policy ghl_appts_update on public.ghl_appointments for update to authenticated
  using ((select private.my_role()) = 'owner')
  with check ((select private.my_role()) = 'owner');

create policy ghl_syncs_read on public.ghl_syncs for select to authenticated
  using ((select private.my_role()) in ('owner', 'manager'));
create policy ghl_syncs_insert on public.ghl_syncs for insert to authenticated
  with check ((select private.my_role()) = 'owner' and ran_by = (select auth.uid()));

-- Two-factor required, like every other table.
create policy ghl_opps_requires_2fa on public.ghl_opportunities as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');
create policy ghl_appts_requires_2fa on public.ghl_appointments as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');
create policy ghl_syncs_requires_2fa on public.ghl_syncs as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

commit;
