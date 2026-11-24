-- Agency Atlas: saved audits for Sales, with spending caps (approved 2026-11-24,
-- docs/AUDIT_BUILDER_PLAN.md Phase A; replaces "Part B" of docs/SALES_SIMPLIFY_PLAN.md).
--
-- Run ONCE in the Supabase SQL Editor (after 0001-0022).
--
-- What this adds:
-- * audits            – one saved audit: what the rep typed (intake), which checkpoints
--                       (sections), and later the results (config + data). Owner and
--                       managers read all; a salesperson reads ONLY the audits they made;
--                       developers read none. Never deleted; owner/managers can archive.
-- * audit_settings    – one row (owner edits): spending caps, the agency name shown on the
--                       pages, and the three plan prices for the Investment section.
-- * audit_user_limits – optional weekly cap per salesperson (owner sets).
-- * audit_spend       – add-only ledger of data costs. Nothing writes it yet (the app does
--                       not fetch paid data until a later phase). The database refuses a
--                       row that would go over the per-audit, weekly or monthly cap.
-- Nothing here talks to GoHighLevel or any outside service.

begin;

-- ---------------------------------------------------------------------------
-- 1. Saved audits
-- ---------------------------------------------------------------------------
create table public.audits (
  id             uuid primary key default gen_random_uuid(),
  created_by     uuid not null default auth.uid() references auth.users (id),
  lead_ghl_id    text check (lead_ghl_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  kind           text not null default 'seo' check (kind in ('seo', 'ads')),
  title          text not null check (
                   char_length(title) between 1 and 120
                   and title !~ '[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}'
                 ),
  -- Keep this list in step with AUDIT_SECTION_IDS in src/lib/audit/sections.ts (a test checks).
  sections       text[] not null default '{}' check (
                   cardinality(sections) <= 20
                   and sections <@ array['summary', 'rankings', 'heatmap', 'competitors', 'fixes', 'keywords',
                                         'revenue', 'timeline', 'investment', 'reviews', 'site_health',
                                         'ai_search', 'backlinks']::text[]
                 ),
  intake         jsonb not null check (jsonb_typeof(intake) = 'object' and pg_column_size(intake) <= 20000),
  config         jsonb check (config is null or (jsonb_typeof(config) = 'object' and pg_column_size(config) <= 100000)),
  data           jsonb check (data is null or (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 2000000)),
  data_retrieved date,
  archived_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index audits_by_idx on public.audits (created_by, created_at desc);
create index audits_lead_idx on public.audits (lead_ghl_id) where lead_ghl_id is not null;

-- The database sets the times; nobody can back-date an audit or change who made it.
create function private.audit_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.lead_ghl_id := old.lead_ghl_id;
    new.kind := old.kind;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.audit_stamp() from public, anon;
create trigger audit_stamp before insert or update on public.audits
  for each row execute function private.audit_stamp();

revoke all on public.audits from public, anon, authenticated;
grant select, insert on public.audits to authenticated;
grant update (title, sections, intake, config, data, data_retrieved, archived_at) on public.audits to authenticated;
-- No delete grant: audits are archived, never deleted.
alter table public.audits enable row level security;

create policy audits_read on public.audits for select to authenticated
  using (
    (select private.my_role()) in ('owner', 'manager')
    or ((select private.my_role()) = 'sales' and created_by = (select auth.uid()))
  );
create policy audits_add on public.audits for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and archived_at is null
    and (
      (select private.my_role()) in ('owner', 'manager')
      or (
        (select private.my_role()) = 'sales'
        and (lead_ghl_id is null or private.is_sales_lead(lead_ghl_id))
      )
    )
  );
create policy audits_edit on public.audits for update to authenticated
  using (
    (select private.my_role()) in ('owner', 'manager')
    or ((select private.my_role()) = 'sales' and created_by = (select auth.uid()) and archived_at is null)
  )
  with check (
    (select private.my_role()) in ('owner', 'manager')
    or ((select private.my_role()) = 'sales' and created_by = (select auth.uid()) and archived_at is null)
  );
create policy audits_requires_2fa on public.audits as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

-- ---------------------------------------------------------------------------
-- 2. Audit settings: one row. Caps (owner can change them) + agency name + plan prices.
-- ---------------------------------------------------------------------------
create table public.audit_settings (
  id                 boolean primary key default true check (id),
  per_audit_usd      numeric(8, 2) not null default 5 check (per_audit_usd between 0 and 50),
  weekly_usd         numeric(8, 2) not null default 10 check (weekly_usd between 0 and 500),
  monthly_usd        numeric(8, 2) not null default 50 check (monthly_usd between 0 and 2000),
  agency_name        text check (char_length(agency_name) between 1 and 80),
  agency_website     text check (char_length(agency_website) <= 120 and agency_website !~ '\s'),
  -- Up to 4 plans: [{name, hoursPerMonth, priceUsd, summary, recommended}] (checked by the app too).
  plans              jsonb not null default '[]' check (jsonb_typeof(plans) = 'array' and jsonb_array_length(plans) <= 4 and pg_column_size(plans) <= 4000),
  updated_by         uuid references auth.users (id),
  updated_at         timestamptz not null default now()
);
insert into public.audit_settings (id) values (true);

revoke all on public.audit_settings from public, anon, authenticated;
grant select on public.audit_settings to authenticated;
grant update (per_audit_usd, weekly_usd, monthly_usd, agency_name, agency_website, plans, updated_by, updated_at) on public.audit_settings to authenticated;
alter table public.audit_settings enable row level security;
-- Salespeople read it too: they see their cap and the plan prices on their audits.
create policy audit_settings_read on public.audit_settings for select to authenticated
  using ((select private.my_role()) in ('owner', 'manager', 'sales'));
create policy audit_settings_edit on public.audit_settings for update to authenticated
  using ((select private.my_role()) = 'owner')
  with check ((select private.my_role()) = 'owner' and updated_by = (select auth.uid()));
create policy audit_settings_requires_2fa on public.audit_settings as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

-- ---------------------------------------------------------------------------
-- 3. Optional weekly cap per salesperson (overrides the weekly cap above)
-- ---------------------------------------------------------------------------
create table public.audit_user_limits (
  user_id     uuid primary key references public.team_members (user_id) on delete cascade,
  weekly_usd  numeric(8, 2) not null check (weekly_usd between 0 and 500),
  updated_by  uuid not null default auth.uid() references auth.users (id),
  updated_at  timestamptz not null default now()
);

revoke all on public.audit_user_limits from public, anon, authenticated;
grant select, insert on public.audit_user_limits to authenticated;
grant update (weekly_usd, updated_by, updated_at) on public.audit_user_limits to authenticated;
alter table public.audit_user_limits enable row level security;
create policy audit_user_limits_read on public.audit_user_limits for select to authenticated
  using ((select private.my_role()) in ('owner', 'manager') or user_id = (select auth.uid()));
create policy audit_user_limits_add on public.audit_user_limits for insert to authenticated
  with check ((select private.my_role()) = 'owner' and updated_by = (select auth.uid()));
create policy audit_user_limits_edit on public.audit_user_limits for update to authenticated
  using ((select private.my_role()) = 'owner')
  with check ((select private.my_role()) = 'owner' and updated_by = (select auth.uid()));
create policy audit_user_limits_requires_2fa on public.audit_user_limits as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

-- ---------------------------------------------------------------------------
-- 4. Spending ledger (add-only). The database enforces every cap, so an app bug can
--    never spend past them. Weeks run Monday to Sunday, New York time.
-- ---------------------------------------------------------------------------
create table public.audit_spend (
  id        uuid primary key default gen_random_uuid(),
  audit_id  uuid not null references public.audits (id),
  user_id   uuid not null default auth.uid() references auth.users (id),
  provider  text not null check (provider in ('dataforseo', 'leadsnap', 'semrush')),
  usd       numeric(8, 4) not null check (usd > 0 and usd <= 50),
  at        timestamptz not null default now()
);
create index audit_spend_user_idx on public.audit_spend (user_id, at desc);
create index audit_spend_at_idx on public.audit_spend (at desc);

create function private.audit_spend_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.audit_settings;
  ny_now timestamp := now() at time zone 'America/New_York';
  week_start timestamptz := date_trunc('week', ny_now) at time zone 'America/New_York';
  month_start timestamptz := date_trunc('month', ny_now) at time zone 'America/New_York';
  weekly numeric;
  used numeric;
begin
  new.at := now();
  select * into s from public.audit_settings where id;
  select coalesce(sum(usd), 0) into used from public.audit_spend where audit_id = new.audit_id;
  if used + new.usd > s.per_audit_usd then
    raise exception 'over the per-audit cap' using errcode = 'check_violation';
  end if;
  select coalesce((select weekly_usd from public.audit_user_limits where user_id = new.user_id), s.weekly_usd) into weekly;
  select coalesce(sum(usd), 0) into used from public.audit_spend where user_id = new.user_id and at >= week_start;
  if used + new.usd > weekly then
    raise exception 'over the weekly cap' using errcode = 'check_violation';
  end if;
  select coalesce(sum(usd), 0) into used from public.audit_spend where at >= month_start;
  if used + new.usd > s.monthly_usd then
    raise exception 'over the monthly cap' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke all on function private.audit_spend_guard() from public, anon;
create trigger audit_spend_guard before insert on public.audit_spend
  for each row execute function private.audit_spend_guard();

revoke all on public.audit_spend from public, anon, authenticated;
grant select, insert on public.audit_spend to authenticated;
-- No update or delete grant: the ledger only grows.
alter table public.audit_spend enable row level security;
create policy audit_spend_read on public.audit_spend for select to authenticated
  using ((select private.my_role()) in ('owner', 'manager') or user_id = (select auth.uid()));
-- Only on an audit the person can see (the audits rules above apply inside this check).
create policy audit_spend_add on public.audit_spend for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select private.my_role()) in ('owner', 'manager', 'sales')
    and exists (select 1 from public.audits a where a.id = audit_id and a.archived_at is null)
  );
create policy audit_spend_requires_2fa on public.audit_spend as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

commit;
