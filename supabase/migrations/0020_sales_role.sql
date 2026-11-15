-- Agency Atlas: Sales role, leads, reach-outs and daily targets (approved 2026-11-15,
-- docs/SALES_PLAN.md; lead values visible to sales; default target 15 per weekday).
--
-- Run ONCE in the Supabase SQL Editor (after 0001-0019).
--
-- What this adds:
-- * A fourth role, 'sales'. Like every role, it sees NOTHING unless a rule below says so.
--   Sales may read: open leads in the SALES pipelines only, GoHighLevel user names,
--   the sales pipeline list, reach-outs on those leads, their own target, their own team
--   row, lead follow-ups (never client items), and Kit pages meant for sales.
-- * team_members.ghl_user_id – which GoHighLevel user a login is (owner sets it).
-- * ghl_opportunities.pipeline_id + assigned_user_id (copied by Sync, read-only from GHL).
-- * ghl_users        – GoHighLevel user id + name ONLY (no emails, no phones).
-- * sales_pipelines  – which pipelines count as Sales, and their "hot" stages (owner).
--                       Turned off, never deleted.
-- * lead_touches     – "Called / Texted / Emailed / Met" on a lead. Add-only; the
--                       database stamps who and when; notes refuse emails and phones.
-- * sales_targets    – daily reach-out number per person (owner sets; default 15).
-- * lead_refreshes   – "Refresh leads" log, at most once every 10 minutes for everyone.
--   Owner, managers and sales may refresh SALES-pipeline leads (and GHL user names).
--   The owner's full Sync is unchanged.
-- GoHighLevel stays read-only: nothing here is ever sent to it.

begin;

-- ---------------------------------------------------------------------------
-- 1. The role, and which GoHighLevel user a login is
-- ---------------------------------------------------------------------------
alter table public.team_members drop constraint team_members_role_check;
alter table public.team_members add constraint team_members_role_check
  check (role in ('owner', 'manager', 'developer', 'sales'));

alter table public.team_members
  add column ghl_user_id text unique check (ghl_user_id ~ '^[A-Za-z0-9]{6,40}$');

-- The owner links logins to GoHighLevel users in the app (only this one column).
grant update (ghl_user_id) on public.team_members to authenticated;
create policy team_link_ghl_user on public.team_members for update to authenticated
  using ((select private.my_role()) = 'owner')
  with check ((select private.my_role()) = 'owner');

create function private.my_ghl_user_id()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select ghl_user_id from public.team_members where user_id = auth.uid()
$$;
revoke all on function private.my_ghl_user_id() from public, anon;
grant execute on function private.my_ghl_user_id() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Sales pipelines (owner picks them; turned off, never deleted)
-- ---------------------------------------------------------------------------
create table public.sales_pipelines (
  pipeline_id   text primary key check (pipeline_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  pipeline_name text check (char_length(pipeline_name) <= 100),
  hot_stages    text[] not null default '{}'
                  check (cardinality(hot_stages) <= 30 and coalesce(array_to_string(hot_stages, '') !~ '[@]', true)),
  active        boolean not null default true,
  updated_by    uuid not null default auth.uid() references auth.users (id),
  updated_at    timestamptz not null default now()
);

revoke all on public.sales_pipelines from public, anon, authenticated;
grant select, insert on public.sales_pipelines to authenticated;
grant update (pipeline_name, hot_stages, active, updated_by, updated_at) on public.sales_pipelines to authenticated;
alter table public.sales_pipelines enable row level security;
create policy sales_pipelines_read on public.sales_pipelines for select to authenticated
  using ((select private.my_role()) in ('owner', 'manager', 'sales'));
create policy sales_pipelines_add on public.sales_pipelines for insert to authenticated
  with check ((select private.my_role()) = 'owner' and updated_by = (select auth.uid()));
create policy sales_pipelines_edit on public.sales_pipelines for update to authenticated
  using ((select private.my_role()) = 'owner')
  with check ((select private.my_role()) = 'owner' and updated_by = (select auth.uid()));
create policy sales_pipelines_requires_2fa on public.sales_pipelines as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

create function private.is_sales_pipeline(p_pipeline text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.sales_pipelines sp where sp.pipeline_id = p_pipeline and sp.active)
$$;
revoke all on function private.is_sales_pipeline(text) from public, anon;
grant execute on function private.is_sales_pipeline(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Leads: pipeline + assignee on the read-only copies; sales see open sales leads only
-- ---------------------------------------------------------------------------
alter table public.ghl_opportunities
  add column pipeline_id text check (pipeline_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  add column assigned_user_id text check (assigned_user_id ~ '^[A-Za-z0-9]{6,40}$');
create index ghl_opportunities_pipeline_idx on public.ghl_opportunities (pipeline_id, status);

-- Is this an open lead in a sales pipeline? (Used by the sales rules.)
create function private.is_sales_lead(p_ghl_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.ghl_opportunities o
    where o.ghl_id = p_ghl_id and o.status = 'open'
      and exists (select 1 from public.sales_pipelines sp where sp.pipeline_id = o.pipeline_id and sp.active)
  )
$$;
revoke all on function private.is_sales_lead(text) from public, anon;
grant execute on function private.is_sales_lead(text) to authenticated;

create policy ghl_opps_read_sales on public.ghl_opportunities for select to authenticated
  using ((select private.my_role()) = 'sales' and status = 'open' and private.is_sales_pipeline(pipeline_id));

-- "Refresh leads": owner, managers and sales may write copies of SALES-pipeline leads only.
create policy ghl_opps_refresh_insert on public.ghl_opportunities for insert to authenticated
  with check ((select private.my_role()) in ('manager', 'sales') and private.is_sales_pipeline(pipeline_id));
create policy ghl_opps_refresh_update on public.ghl_opportunities for update to authenticated
  using ((select private.my_role()) in ('manager', 'sales') and private.is_sales_pipeline(pipeline_id))
  with check ((select private.my_role()) in ('manager', 'sales') and private.is_sales_pipeline(pipeline_id));

-- ---------------------------------------------------------------------------
-- 4. GoHighLevel users: id + name only
-- ---------------------------------------------------------------------------
create table public.ghl_users (
  ghl_user_id text primary key check (ghl_user_id ~ '^[A-Za-z0-9]{6,40}$'),
  name        text check (
                char_length(name) between 1 and 80
                and name !~ '[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}'
                and name !~ '\d[\d\s().-]{6,}\d'
              ),
  synced_at   timestamptz not null default now()
);

revoke all on public.ghl_users from public, anon, authenticated;
grant select, insert on public.ghl_users to authenticated;
grant update (name, synced_at) on public.ghl_users to authenticated;
alter table public.ghl_users enable row level security;
create policy ghl_users_read on public.ghl_users for select to authenticated
  using ((select private.my_role()) in ('owner', 'manager', 'sales'));
create policy ghl_users_write on public.ghl_users for insert to authenticated
  with check ((select private.my_role()) in ('owner', 'manager', 'sales'));
create policy ghl_users_update on public.ghl_users for update to authenticated
  using ((select private.my_role()) in ('owner', 'manager', 'sales'))
  with check ((select private.my_role()) in ('owner', 'manager', 'sales'));
create policy ghl_users_requires_2fa on public.ghl_users as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

-- ---------------------------------------------------------------------------
-- 5. Reach-outs on a lead (add-only; stamped by the database)
-- ---------------------------------------------------------------------------
create table public.lead_touches (
  id          uuid primary key default gen_random_uuid(),
  lead_ghl_id text not null check (lead_ghl_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  kind        text not null check (kind in ('call', 'text', 'email', 'meeting', 'walk_in', 'other')),
  note        text check (
                char_length(note) between 1 and 200
                and note !~ '[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}'
                and note !~ '(^|[^0-9])\(?[0-9]{3}\)?[-. ][0-9]{3}[-. ][0-9]{4}([^0-9]|$)'
              ),
  touched_by  uuid not null default auth.uid() references auth.users (id),
  touched_at  timestamptz not null default now()
);
create index lead_touches_lead_idx on public.lead_touches (lead_ghl_id, touched_at desc);
create index lead_touches_by_idx on public.lead_touches (touched_by, touched_at desc);

create function private.lead_touch_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.touched_at := now();
  return new;
end;
$$;
revoke all on function private.lead_touch_stamp() from public, anon;
create trigger lead_touch_stamp before insert on public.lead_touches
  for each row execute function private.lead_touch_stamp();

revoke all on public.lead_touches from public, anon, authenticated;
grant select, insert on public.lead_touches to authenticated;
alter table public.lead_touches enable row level security;
create policy lead_touches_read on public.lead_touches for select to authenticated
  using (
    (select private.my_role()) in ('owner', 'manager')
    or ((select private.my_role()) = 'sales' and private.is_sales_lead(lead_ghl_id))
  );
create policy lead_touches_add on public.lead_touches for insert to authenticated
  with check (
    touched_by = (select auth.uid())
    and (
      (select private.my_role()) in ('owner', 'manager')
      or ((select private.my_role()) = 'sales' and private.is_sales_lead(lead_ghl_id))
    )
  );
create policy lead_touches_requires_2fa on public.lead_touches as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

-- ---------------------------------------------------------------------------
-- 6. Daily targets (owner sets; each salesperson reads their own)
-- ---------------------------------------------------------------------------
create table public.sales_targets (
  user_id      uuid primary key references public.team_members (user_id) on delete cascade,
  daily_target integer not null default 15 check (daily_target between 0 and 200),
  updated_by   uuid not null default auth.uid() references auth.users (id),
  updated_at   timestamptz not null default now()
);

revoke all on public.sales_targets from public, anon, authenticated;
grant select, insert on public.sales_targets to authenticated;
grant update (daily_target, updated_by, updated_at) on public.sales_targets to authenticated;
alter table public.sales_targets enable row level security;
create policy sales_targets_read on public.sales_targets for select to authenticated
  using ((select private.my_role()) in ('owner', 'manager') or user_id = (select auth.uid()));
create policy sales_targets_add on public.sales_targets for insert to authenticated
  with check ((select private.my_role()) = 'owner' and updated_by = (select auth.uid()));
create policy sales_targets_edit on public.sales_targets for update to authenticated
  using ((select private.my_role()) = 'owner')
  with check ((select private.my_role()) = 'owner' and updated_by = (select auth.uid()));
create policy sales_targets_requires_2fa on public.sales_targets as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

-- ---------------------------------------------------------------------------
-- 7. "Refresh leads" log: at most once every 10 minutes, for everyone together
-- ---------------------------------------------------------------------------
create table public.lead_refreshes (
  id      uuid primary key default gen_random_uuid(),
  ran_at  timestamptz not null default now(),
  ran_by  uuid not null default auth.uid() references auth.users (id),
  leads   integer check (leads >= 0)
);

create function private.lead_refresh_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.lead_refreshes r where r.ran_at > now() - interval '10 minutes') then
    raise exception 'leads were refreshed less than 10 minutes ago' using errcode = 'check_violation';
  end if;
  new.ran_at := now();
  return new;
end;
$$;
revoke all on function private.lead_refresh_limit() from public, anon;
create trigger lead_refresh_limit before insert on public.lead_refreshes
  for each row execute function private.lead_refresh_limit();

revoke all on public.lead_refreshes from public, anon, authenticated;
grant select, insert on public.lead_refreshes to authenticated;
alter table public.lead_refreshes enable row level security;
create policy lead_refreshes_read on public.lead_refreshes for select to authenticated
  using ((select private.my_role()) in ('owner', 'manager', 'sales'));
create policy lead_refreshes_add on public.lead_refreshes for insert to authenticated
  with check ((select private.my_role()) in ('owner', 'manager', 'sales') and ran_by = (select auth.uid()));
create policy lead_refreshes_requires_2fa on public.lead_refreshes as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

-- ---------------------------------------------------------------------------
-- 8. Lead follow-ups: sales read, add and update follow-ups on LEADS only
-- ---------------------------------------------------------------------------
create policy actions_read_sales on public.actions for select to authenticated
  using ((select private.my_role()) = 'sales' and lead_ghl_id is not null and kind = 'follow_up' and trashed_at is null);
create policy actions_insert_sales on public.actions for insert to authenticated
  with check ((select private.my_role()) = 'sales' and lead_ghl_id is not null and kind = 'follow_up' and created_by = (select auth.uid()));
create policy actions_update_sales on public.actions for update to authenticated
  using ((select private.my_role()) = 'sales' and lead_ghl_id is not null and kind = 'follow_up' and trashed_at is null)
  with check ((select private.my_role()) = 'sales' and lead_ghl_id is not null and kind = 'follow_up');

-- ---------------------------------------------------------------------------
-- 9. Kit: pages can be meant for sales too
-- ---------------------------------------------------------------------------
alter table public.kit_docs drop constraint kit_docs_audience_check;
alter table public.kit_docs add constraint kit_docs_audience_check
  check (audience <@ array['manager', 'developer', 'sales']::text[]);
create policy kit_docs_read_sales on public.kit_docs for select to authenticated
  using ((select private.my_role()) = 'sales' and 'sales' = any (audience) and not archived);

commit;
