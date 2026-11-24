-- Agency Atlas: client care, Step 1A (approved 2026-11-24, docs/CLIENT_CARE_PLAN.md).
--
-- Run ONCE in the Supabase SQL Editor (after 0001-0024; 0024 is Scout). Numbered 0025 by
-- the owner on 2026-11-24 (Scout took 0024). Before running it, check that
-- today's daily backup exists (Supabase > Database > Backups). Undo steps are at the end.
--
-- What this adds:
-- * care_plans    – plan tiers per service (SEO first): name, order, hours a month, what's
--                   included and the contact rhythm. Owner and managers read; owner edits.
--                   Never deleted (archive instead). No prices here.
-- * client_plans  – which tier each client is on, one per service. Owner sets/changes it;
--                   a manager may set it ONCE for a client that has none (Add client).
-- * client_money  – each client's monthly amount. OWNER ONLY. Copied from clients.monthly_usd.
-- * clients       – vip (owner only), backup_staff_id (backup person), care_started_on.
--                   Managers may now ADD a client (never VIP, never a price).
--                   clients.monthly_usd can no longer be read or changed through the app:
--                   the amount now lives only in client_money. The old column is left in
--                   place (unchanged) until a later, separately approved migration clears it.
-- Nothing here talks to GoHighLevel or any outside service.

begin;

-- ---------------------------------------------------------------------------
-- 0. Shared stamp: the database sets who changed a row and when.
-- ---------------------------------------------------------------------------
create function private.care_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end;
$$;
revoke all on function private.care_stamp() from public, anon;

-- ---------------------------------------------------------------------------
-- 1. Plan tiers
-- ---------------------------------------------------------------------------
create table public.care_plans (
  id                       uuid primary key default gen_random_uuid(),
  service                  text not null check (service in ('SEO', 'Ads', 'Website')),
  name                     text not null check (char_length(btrim(name)) between 1 and 40),
  rank                     smallint not null default 1 check (rank between 1 and 20),
  hours_per_month          numeric(5, 1) check (hours_per_month > 0 and hours_per_month <= 300),
  -- Short lines ("Monthly SEO report"). The app checks each line's length too.
  includes                 text[] not null default '{}' check (
                             cardinality(includes) <= 12 and char_length(array_to_string(includes, '')) <= 1200
                           ),
  heat_maps_per_month      smallint check (heat_maps_per_month between 0 and 8),
  report_every_days        smallint not null default 30 check (report_every_days between 7 and 120),
  mid_month_check_in       boolean not null default true,
  competitor_review_months smallint not null default 0 check (competitor_review_months between 0 and 24),
  top_tier                 boolean not null default false,
  archived                 boolean not null default false,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  updated_by               uuid references auth.users (id),
  unique (id, service)
);
create unique index care_plans_name_idx on public.care_plans (service, lower(btrim(name)));

create trigger care_plans_stamp before insert or update on public.care_plans
  for each row execute function private.care_stamp();

revoke all on public.care_plans from public, anon, authenticated;
grant select, insert on public.care_plans to authenticated;
grant update (name, rank, hours_per_month, includes, heat_maps_per_month, report_every_days,
              mid_month_check_in, competitor_review_months, top_tier, archived) on public.care_plans to authenticated;
-- No delete grant: tiers are archived, never deleted.
alter table public.care_plans enable row level security;
create policy care_plans_read on public.care_plans for select to authenticated
  using ((select private.my_role()) in ('owner', 'manager'));
create policy care_plans_add on public.care_plans for insert to authenticated
  with check ((select private.my_role()) = 'owner');
create policy care_plans_edit on public.care_plans for update to authenticated
  using ((select private.my_role()) = 'owner')
  with check ((select private.my_role()) = 'owner');
create policy care_plans_requires_2fa on public.care_plans as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

-- Starting tiers from the owner (2026-11-24). Edit them on Clients > Plan tiers.
insert into public.care_plans (service, name, rank, hours_per_month, includes, heat_maps_per_month, report_every_days, mid_month_check_in, competitor_review_months, top_tier) values
  ('SEO', 'Starter', 1, 10,
   array['Up to 10 hours of SEO work a month', 'Competitor analysis before we start', 'Heat maps about every 2 weeks (2–3 keywords)', 'Monthly SEO report'],
   2, 30, true, 0, false),
  ('SEO', 'Growth', 2, null,
   array['Competitor analysis before we start', 'Heat maps about every 2 weeks', 'Monthly SEO report', 'Competitor review every quarter'],
   2, 30, true, 3, false),
  ('SEO', 'Pro', 3, 30,
   array['Up to 30 hours of SEO work a month', 'Competitor analysis before we start', 'Heat maps about every 2 weeks', 'Monthly SEO report', 'Competitor review every quarter'],
   2, 30, true, 3, true);

-- ---------------------------------------------------------------------------
-- 2. Which tier each client is on (one per service). No deletes: "no tier" = plan_id null.
-- ---------------------------------------------------------------------------
create table public.client_plans (
  client_id  uuid not null references public.clients (id) on delete cascade,
  service    text not null check (service in ('SEO', 'Ads', 'Website')),
  plan_id    uuid,
  started_on date not null default current_date,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id),
  primary key (client_id, service),
  -- The tier must belong to the same service (an Ads tier can't be a client's SEO plan).
  foreign key (plan_id, service) references public.care_plans (id, service) on delete restrict
);
create index client_plans_plan_idx on public.client_plans (plan_id);

create trigger client_plans_stamp before insert or update on public.client_plans
  for each row execute function private.care_stamp();

revoke all on public.client_plans from public, anon, authenticated;
grant select, insert on public.client_plans to authenticated;
grant update (plan_id, started_on) on public.client_plans to authenticated;
alter table public.client_plans enable row level security;
create policy client_plans_read on public.client_plans for select to authenticated
  using ((select private.my_role()) in ('owner', 'manager'));
-- Managers can only ADD (the primary key stops a second row), so they can set a tier
-- for a client that has none, but only the owner changes it afterwards.
create policy client_plans_add on public.client_plans for insert to authenticated
  with check ((select private.my_role()) in ('owner', 'manager'));
create policy client_plans_edit on public.client_plans for update to authenticated
  using ((select private.my_role()) = 'owner')
  with check ((select private.my_role()) = 'owner');
create policy client_plans_requires_2fa on public.client_plans as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

-- ---------------------------------------------------------------------------
-- 3. Each client's monthly amount: OWNER ONLY.
-- ---------------------------------------------------------------------------
create table public.client_money (
  client_id   uuid primary key references public.clients (id) on delete cascade,
  monthly_usd numeric(10, 2) not null check (monthly_usd between 0 and 100000),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id)
);

-- Copy every amount across (as the database admin, so nothing is skipped).
insert into public.client_money (client_id, monthly_usd)
  select id, monthly_usd from public.clients;

create trigger client_money_stamp before insert or update on public.client_money
  for each row execute function private.care_stamp();

revoke all on public.client_money from public, anon, authenticated;
grant select, insert on public.client_money to authenticated;
grant update (monthly_usd) on public.client_money to authenticated;
alter table public.client_money enable row level security;
create policy client_money_owner on public.client_money for all to authenticated
  using ((select private.my_role()) = 'owner')
  with check ((select private.my_role()) = 'owner');
create policy client_money_requires_2fa on public.client_money as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

-- ---------------------------------------------------------------------------
-- 4. Clients: VIP, backup person, care start; managers may add; the amount is locked away.
-- ---------------------------------------------------------------------------
alter table public.clients
  add column vip             boolean not null default false,
  add column backup_staff_id uuid references public.staff (id) on delete restrict,
  add column care_started_on date check (care_started_on > date '2020-01-01');
-- New clients get their amount in client_money; the old column just holds 0 for them.
alter table public.clients alter column monthly_usd set default 0;

-- Column-by-column rights, so monthly_usd can't be read or changed through the app at all.
revoke select, insert, update on public.clients from authenticated;
grant select (id, slug, name, start_date, status, services, listed_in, check_note, follow_up, end_date,
              created_at, updated_at, owner_staff_id, trashed_at, trashed_by,
              vip, backup_staff_id, care_started_on) on public.clients to authenticated;
grant insert (slug, name, start_date, status, services, listed_in, check_note, follow_up, end_date,
              owner_staff_id, vip, backup_staff_id, care_started_on) on public.clients to authenticated;
grant update (name, start_date, status, services, listed_in, check_note, follow_up, end_date,
              owner_staff_id, trashed_at, vip, backup_staff_id, care_started_on) on public.clients to authenticated;

-- Managers add clients: active, not VIP, not in Trash. (They still can't edit clients:
-- the 0019 guard only lets them move clients to Trash and back.)
create policy clients_insert_manager on public.clients for insert to authenticated
  with check (
    (select private.my_role()) = 'manager'
    and status = 'active'
    and vip = false
    and end_date is null
  );

commit;

-- ---------------------------------------------------------------------------
-- UNDO (only if something is wrong; run as one block in the SQL Editor). Nothing above
-- deleted data, and clients.monthly_usd still holds the amounts from before this ran,
-- so undoing loses only amounts, tiers and VIP changes made after it ran.
--
-- begin;
-- drop policy clients_insert_manager on public.clients;
-- revoke select, insert, update on public.clients from authenticated;
-- grant select, insert, update on public.clients to authenticated;
-- update public.clients c set monthly_usd = m.monthly_usd from public.client_money m where m.client_id = c.id;
-- alter table public.clients alter column monthly_usd drop default;
-- alter table public.clients drop column vip, drop column backup_staff_id, drop column care_started_on;
-- drop table public.client_money, public.client_plans, public.care_plans;
-- drop function private.care_stamp();
-- commit;
-- ---------------------------------------------------------------------------
