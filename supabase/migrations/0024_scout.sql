-- Agency Atlas: Scout, the local prospect finder in Sales (approved 2026-11-24,
-- docs/SCOUT_PLAN.md S1).
--
-- Run ONCE in the Supabase SQL Editor (after 0001-0023).
--
-- What this adds:
-- * scout_settings       – one row (owner edits): the monthly Scout cap ($25), the default
--                          per-salesperson cap ($10/month), and the "not interested" wait.
-- * scout_user_limits    – optional monthly cap per person (owner sets).
-- * scout_runs           – one Scout run: area, kinds of business, size, estimate. Owner,
--                          managers and salespeople start runs; a salesperson reads only theirs.
-- * scout_spend          – add-only ledger. The estimate is written BEFORE a run; the
--                          database refuses it past the per-person or monthly cap.
-- * scout_prospects      – businesses a run found: public business facts, signals (each
--                          with source + date), score, reasons. NEVER phone numbers, emails
--                          or people's names (database checks). Owner/managers read all; a
--                          salesperson reads theirs + the unclaimed shared pool and may only
--                          claim from the pool for themselves.
-- * scout_visits         – add-only walk-in / call log; the database stamps who and when
--                          and moves the prospect's status.
-- * scout_do_not_contact – businesses never shown again, even in future runs. Nobody deletes.
-- Nothing here talks to GoHighLevel or any outside service.

begin;

-- ---------------------------------------------------------------------------
-- 0. Helpers
-- ---------------------------------------------------------------------------
-- A business name reduced for matching. Keep in step with nameKey() / NAME_STOP_WORDS in
-- src/lib/scout.ts (a test checks the word list).
create function private.scout_name_key(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(
           regexp_replace(
             ' ' || regexp_replace(replace(lower(coalesce(p, '')), '&', ' and '), '[^a-z0-9]+', ' ', 'g') || ' ',
             ' (the|llc|inc|co|company|corp|corporation|ltd|and sons|services|service)(?= )', ' ', 'g'),
           '\s+', '', 'g')
$$;
revoke all on function private.scout_name_key(text) from public, anon;
grant execute on function private.scout_name_key(text) to authenticated;

-- No phone numbers or email addresses in text we store.
create function private.scout_clean(p text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p is null or (
    p !~ '[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}'
    and p !~ '(^|[^0-9])\(?[0-9]{3}\)?[-. ][0-9]{3}[-. ][0-9]{4}([^0-9]|$)'
    and p !~ '(^|[^0-9])\+?1?[0-9]{10}([^0-9]|$)'
  )
$$;
revoke all on function private.scout_clean(text) from public, anon;
grant execute on function private.scout_clean(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Settings (one row) and per-person caps
-- ---------------------------------------------------------------------------
create table public.scout_settings (
  id                   boolean primary key default true check (id),
  monthly_usd          numeric(8, 2) not null default 25 check (monthly_usd between 0 and 1000),
  per_rep_monthly_usd  numeric(8, 2) not null default 10 check (per_rep_monthly_usd between 0 and 1000),
  revisit_days         integer not null default 180 check (revisit_days between 7 and 730),
  updated_by           uuid references auth.users (id),
  updated_at           timestamptz not null default now()
);
insert into public.scout_settings (id) values (true);

revoke all on public.scout_settings from public, anon, authenticated;
grant select on public.scout_settings to authenticated;
grant update (monthly_usd, per_rep_monthly_usd, revisit_days, updated_by, updated_at) on public.scout_settings to authenticated;
alter table public.scout_settings enable row level security;
create policy scout_settings_read on public.scout_settings for select to authenticated
  using ((select private.my_role()) in ('owner', 'manager', 'sales'));
create policy scout_settings_edit on public.scout_settings for update to authenticated
  using ((select private.my_role()) = 'owner')
  with check ((select private.my_role()) = 'owner' and updated_by = (select auth.uid()));
create policy scout_settings_requires_2fa on public.scout_settings as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

create table public.scout_user_limits (
  user_id      uuid primary key references public.team_members (user_id) on delete cascade,
  monthly_usd  numeric(8, 2) not null check (monthly_usd between 0 and 1000),
  updated_by   uuid not null default auth.uid() references auth.users (id),
  updated_at   timestamptz not null default now()
);
revoke all on public.scout_user_limits from public, anon, authenticated;
grant select, insert on public.scout_user_limits to authenticated;
grant update (monthly_usd, updated_by, updated_at) on public.scout_user_limits to authenticated;
alter table public.scout_user_limits enable row level security;
create policy scout_user_limits_read on public.scout_user_limits for select to authenticated
  using ((select private.my_role()) in ('owner', 'manager') or user_id = (select auth.uid()));
create policy scout_user_limits_add on public.scout_user_limits for insert to authenticated
  with check ((select private.my_role()) = 'owner' and updated_by = (select auth.uid()));
create policy scout_user_limits_edit on public.scout_user_limits for update to authenticated
  using ((select private.my_role()) = 'owner')
  with check ((select private.my_role()) = 'owner' and updated_by = (select auth.uid()));
create policy scout_user_limits_requires_2fa on public.scout_user_limits as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

-- ---------------------------------------------------------------------------
-- 2. Runs
-- ---------------------------------------------------------------------------
create table public.scout_runs (
  id           uuid primary key default gen_random_uuid(),
  created_by   uuid not null default auth.uid() references auth.users (id),
  area         text not null check (char_length(area) between 1 and 200 and private.scout_clean(area)),
  kinds        text[] not null check (cardinality(kinds) between 1 and 12 and private.scout_clean(array_to_string(kinds, ' | '))),
  size         integer not null check (size between 1 and 200),
  est_usd      numeric(8, 2) not null check (est_usd > 0 and est_usd <= 50),
  status       text not null default 'planned' check (status in ('planned', 'attached')),
  found        integer check (found between 0 and 200),
  attached_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index scout_runs_by_idx on public.scout_runs (created_by, created_at desc);

create function private.scout_run_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.status := 'planned';
    new.found := null;
    new.attached_at := null;
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.area := old.area;
    new.kinds := old.kinds;
    new.size := old.size;
    new.est_usd := old.est_usd;
    if old.status = 'attached' then
      raise exception 'results are already attached to this run' using errcode = 'check_violation';
    end if;
    new.attached_at := now();
  end if;
  return new;
end;
$$;
revoke all on function private.scout_run_stamp() from public, anon;
create trigger scout_run_stamp before insert or update on public.scout_runs
  for each row execute function private.scout_run_stamp();

revoke all on public.scout_runs from public, anon, authenticated;
grant select, insert on public.scout_runs to authenticated;
grant update (status, found) on public.scout_runs to authenticated;
alter table public.scout_runs enable row level security;
create policy scout_runs_read on public.scout_runs for select to authenticated
  using (
    (select private.my_role()) in ('owner', 'manager')
    or ((select private.my_role()) = 'sales' and created_by = (select auth.uid()))
  );
create policy scout_runs_add on public.scout_runs for insert to authenticated
  with check (created_by = (select auth.uid()) and (select private.my_role()) in ('owner', 'manager', 'sales'));
-- Attaching results: the person who started the run, or the owner/a manager.
create policy scout_runs_attach on public.scout_runs for update to authenticated
  using (
    (select private.my_role()) in ('owner', 'manager')
    or ((select private.my_role()) = 'sales' and created_by = (select auth.uid()))
  )
  with check (status = 'attached');
create policy scout_runs_requires_2fa on public.scout_runs as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

-- ---------------------------------------------------------------------------
-- 3. Spending ledger (add-only). The database enforces the caps: a salesperson's own
--    monthly cap (default $10, or the owner's override), anyone the owner set a cap for,
--    and the monthly total ($25) for everyone. Months by calendar, New York time.
-- ---------------------------------------------------------------------------
create table public.scout_spend (
  id        uuid primary key default gen_random_uuid(),
  run_id    uuid not null references public.scout_runs (id),
  user_id   uuid not null default auth.uid() references auth.users (id),
  provider  text not null check (provider in ('dataforseo', 'semrush')),
  usd       numeric(8, 4) not null check (usd > 0 and usd <= 50),
  at        timestamptz not null default now()
);
create index scout_spend_user_idx on public.scout_spend (user_id, at desc);
create index scout_spend_at_idx on public.scout_spend (at desc);

create function private.scout_spend_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.scout_settings;
  month_start timestamptz := date_trunc('month', now() at time zone 'America/New_York') at time zone 'America/New_York';
  my_cap numeric;
  used numeric;
begin
  new.at := now();
  select * into s from public.scout_settings where id;
  select monthly_usd into my_cap from public.scout_user_limits where user_id = new.user_id;
  if my_cap is null and (select role from public.team_members where user_id = new.user_id) = 'sales' then
    my_cap := s.per_rep_monthly_usd;
  end if;
  if my_cap is not null then
    select coalesce(sum(usd), 0) into used from public.scout_spend where user_id = new.user_id and at >= month_start;
    if used + new.usd > my_cap then
      raise exception 'over your monthly Scout cap' using errcode = 'check_violation';
    end if;
  end if;
  select coalesce(sum(usd), 0) into used from public.scout_spend where at >= month_start;
  if used + new.usd > s.monthly_usd then
    raise exception 'over the monthly Scout cap' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke all on function private.scout_spend_guard() from public, anon;
create trigger scout_spend_guard before insert on public.scout_spend
  for each row execute function private.scout_spend_guard();

revoke all on public.scout_spend from public, anon, authenticated;
grant select, insert on public.scout_spend to authenticated;
-- No update or delete grant: the ledger only grows.
alter table public.scout_spend enable row level security;
create policy scout_spend_read on public.scout_spend for select to authenticated
  using ((select private.my_role()) in ('owner', 'manager') or user_id = (select auth.uid()));
create policy scout_spend_add on public.scout_spend for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select private.my_role()) in ('owner', 'manager', 'sales')
    and exists (select 1 from public.scout_runs r where r.id = run_id and r.created_by = (select auth.uid()))
  );
create policy scout_spend_requires_2fa on public.scout_spend as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

-- ---------------------------------------------------------------------------
-- 4. Do not contact (never shown again; nobody deletes)
-- ---------------------------------------------------------------------------
create table public.scout_do_not_contact (
  business_key  text primary key check (char_length(business_key) between 3 and 220),
  name_key      text not null check (char_length(name_key) <= 200),
  added_by      uuid not null default auth.uid() references auth.users (id),
  added_at      timestamptz not null default now()
);
revoke all on public.scout_do_not_contact from public, anon, authenticated;
grant select, insert on public.scout_do_not_contact to authenticated;
alter table public.scout_do_not_contact enable row level security;
create policy scout_dnc_read on public.scout_do_not_contact for select to authenticated
  using ((select private.my_role()) in ('owner', 'manager'));
create policy scout_dnc_add on public.scout_do_not_contact for insert to authenticated
  with check ((select private.my_role()) in ('owner', 'manager') and added_by = (select auth.uid()));
create policy scout_dnc_requires_2fa on public.scout_do_not_contact as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

-- ---------------------------------------------------------------------------
-- 5. Prospects
-- ---------------------------------------------------------------------------
create table public.scout_prospects (
  id            uuid primary key default gen_random_uuid(),
  run_id        uuid references public.scout_runs (id),
  created_by    uuid not null default auth.uid() references auth.users (id),
  business_key  text not null unique check (char_length(business_key) between 3 and 220),
  name_key      text not null default '',
  name          text not null check (char_length(name) between 1 and 120 and private.scout_clean(name)),
  website       text check (char_length(website) <= 200 and website ~ '^https?://[^\s@]+$'),
  category      text check (char_length(category) <= 80 and private.scout_clean(category)),
  address       text check (char_length(address) <= 200 and private.scout_clean(address)),
  town          text check (char_length(town) <= 80 and private.scout_clean(town)),
  lat           double precision check (lat between -90 and 90),
  lng           double precision check (lng between -180 and 180),
  maps_url      text check (char_length(maps_url) <= 500 and maps_url ~ '^https://'),
  rating        numeric(2, 1) check (rating between 0 and 5),
  reviews       integer check (reviews between 0 and 1000000),
  signals       jsonb not null default '{}' check (jsonb_typeof(signals) = 'object' and pg_column_size(signals) <= 20000 and private.scout_clean(signals::text)),
  score         integer not null check (score between 0 and 100),
  reasons       text[] not null default '{}' check (cardinality(reasons) <= 8 and private.scout_clean(array_to_string(reasons, ' | '))),
  angle         text not null check (angle in ('ads', 'seo', 'website')),
  status        text not null default 'new' check (status in ('new', 'visited', 'interested', 'audit', 'not_interested', 'skipped', 'do_not_contact', 'in_ghl', 'won', 'lost')),
  assigned_to   uuid references public.team_members (user_id),
  claimed_at    timestamptz,
  next_ok_on    date,
  skip_reason   text check (char_length(skip_reason) <= 120 and private.scout_clean(skip_reason)),
  ghl_lead_id   text check (ghl_lead_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  audit_id      uuid references public.audits (id),
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index scout_prospects_assigned_idx on public.scout_prospects (assigned_to, status);
create index scout_prospects_name_idx on public.scout_prospects (name_key);

-- Is this business already ours (a client, or a lead in the GoHighLevel copy) or marked
-- do-not-contact? Reads tables the caller may not see, so it runs as the owner of the
-- function and answers yes/no only.
create function private.scout_known(p_key text, p_name_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.scout_do_not_contact d where d.business_key = p_key or (p_name_key <> '' and d.name_key = p_name_key))
      or (p_name_key <> '' and exists (select 1 from public.clients c where private.scout_name_key(c.name) = p_name_key))
      or (p_name_key <> '' and exists (select 1 from public.ghl_opportunities o where private.scout_name_key(o.name) = p_name_key))
$$;
revoke all on function private.scout_known(text, text) from public, anon;
grant execute on function private.scout_known(text, text) to authenticated;

-- New prospects: the database works out the name key, skips businesses we already have
-- (returns no row, so nothing is saved), and starts every prospect fresh. Changes: only
-- the working fields move; the business facts, who added it and when stay as they were.
-- A salesperson may only claim an unclaimed prospect for themselves (and only that).
create function private.scout_prospect_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare me text := private.my_role();
begin
  if tg_op = 'INSERT' then
    new.name_key := private.scout_name_key(new.name);
    if private.scout_known(new.business_key, new.name_key) then
      return null;
    end if;
    new.created_at := now();
    new.updated_at := now();
    new.status := 'new';
    new.claimed_at := case when new.assigned_to is not null then now() end;
    new.next_ok_on := null;
    new.archived_at := null;
    new.ghl_lead_id := null;
    new.audit_id := null;
    return new;
  end if;
  -- Business facts and history never change.
  new.id := old.id;
  new.run_id := old.run_id;
  new.created_by := old.created_by;
  new.business_key := old.business_key;
  new.name_key := old.name_key;
  new.name := old.name;
  new.website := old.website;
  new.category := old.category;
  new.address := old.address;
  new.town := old.town;
  new.lat := old.lat;
  new.lng := old.lng;
  new.maps_url := old.maps_url;
  new.rating := old.rating;
  new.reviews := old.reviews;
  new.signals := old.signals;
  new.score := old.score;
  new.reasons := old.reasons;
  new.angle := old.angle;
  new.created_at := old.created_at;
  new.updated_at := now();
  if me = 'sales' and pg_trigger_depth() > 1 then
    -- A logged visit moving the status (private.scout_visit_effect): only status and
    -- the "try again after" date change; everything else stays.
    new.assigned_to := old.assigned_to;
    new.claimed_at := old.claimed_at;
    new.skip_reason := old.skip_reason;
    new.ghl_lead_id := old.ghl_lead_id;
    new.audit_id := old.audit_id;
    new.archived_at := old.archived_at;
  elsif me = 'sales' then
    -- The one change a salesperson makes directly: claim from the pool for themselves.
    if not (old.assigned_to is null and old.status = 'new' and new.assigned_to = auth.uid())
       or new.status is distinct from old.status
       or new.next_ok_on is distinct from old.next_ok_on
       or new.skip_reason is distinct from old.skip_reason
       or new.ghl_lead_id is distinct from old.ghl_lead_id
       or new.audit_id is distinct from old.audit_id
       or new.archived_at is distinct from old.archived_at then
      raise exception 'salespeople can only claim an unclaimed prospect' using errcode = 'insufficient_privilege';
    end if;
    new.status := old.status;
    new.next_ok_on := old.next_ok_on;
    new.skip_reason := old.skip_reason;
    new.ghl_lead_id := old.ghl_lead_id;
    new.audit_id := old.audit_id;
    new.archived_at := old.archived_at;
    new.claimed_at := now();
  elsif new.assigned_to is distinct from old.assigned_to then
    new.claimed_at := case when new.assigned_to is not null then now() end;
  end if;
  return new;
end;
$$;
revoke all on function private.scout_prospect_rules() from public, anon;
create trigger scout_prospect_rules before insert or update on public.scout_prospects
  for each row execute function private.scout_prospect_rules();

revoke all on public.scout_prospects from public, anon, authenticated;
grant select, insert on public.scout_prospects to authenticated;
grant update (status, assigned_to, next_ok_on, skip_reason, ghl_lead_id, audit_id, archived_at) on public.scout_prospects to authenticated;
-- No delete grant: prospects are archived, never deleted.
alter table public.scout_prospects enable row level security;
create policy scout_prospects_read on public.scout_prospects for select to authenticated
  using (
    (select private.my_role()) in ('owner', 'manager')
    or (
      (select private.my_role()) = 'sales'
      and archived_at is null
      and (assigned_to = (select auth.uid()) or (assigned_to is null and status = 'new'))
    )
  );
-- Salespeople add prospects only from their own run, only for themselves.
create policy scout_prospects_add on public.scout_prospects for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (
      (
        (select private.my_role()) in ('owner', 'manager')
        and (run_id is null or exists (select 1 from public.scout_runs r where r.id = run_id))
      )
      or (
        (select private.my_role()) = 'sales'
        and assigned_to = (select auth.uid())
        and exists (select 1 from public.scout_runs r where r.id = run_id and r.created_by = (select auth.uid()))
      )
    )
  );
create policy scout_prospects_edit on public.scout_prospects for update to authenticated
  using (
    (select private.my_role()) in ('owner', 'manager')
    or ((select private.my_role()) = 'sales' and archived_at is null and assigned_to is null and status = 'new')
  )
  with check (
    (select private.my_role()) in ('owner', 'manager')
    or ((select private.my_role()) = 'sales' and assigned_to = (select auth.uid()))
  );
create policy scout_prospects_requires_2fa on public.scout_prospects as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

-- ---------------------------------------------------------------------------
-- 6. Visits and calls (add-only). The outcome moves the prospect's status; "do not
--    contact" / "no soliciting" also add it to the do-not-contact list.
-- ---------------------------------------------------------------------------
create table public.scout_visits (
  id           uuid primary key default gen_random_uuid(),
  prospect_id  uuid not null references public.scout_prospects (id),
  user_id      uuid not null default auth.uid() references auth.users (id),
  kind         text not null check (kind in ('walk_in', 'call')),
  outcome      text not null check (outcome in ('not_in', 'staff', 'owner', 'not_interested', 'interested', 'wants_audit', 'no_soliciting', 'do_not_contact')),
  note         text check (char_length(note) <= 200 and private.scout_clean(note)),
  at           timestamptz not null default now()
);
create index scout_visits_prospect_idx on public.scout_visits (prospect_id, at desc);
create index scout_visits_user_idx on public.scout_visits (user_id, at desc);

create function private.scout_visit_effect()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.scout_prospects;
  wait integer;
begin
  select * into p from public.scout_prospects where id = new.prospect_id;
  select revisit_days into wait from public.scout_settings where id;
  if new.outcome in ('do_not_contact', 'no_soliciting') then
    update public.scout_prospects set status = 'do_not_contact', updated_at = now() where id = p.id;
    insert into public.scout_do_not_contact (business_key, name_key, added_by)
      values (p.business_key, p.name_key, new.user_id) on conflict (business_key) do nothing;
  elsif new.outcome = 'not_interested' then
    update public.scout_prospects set status = 'not_interested', next_ok_on = (now() at time zone 'America/New_York')::date + wait, updated_at = now() where id = p.id;
  elsif new.outcome = 'wants_audit' then
    update public.scout_prospects set status = 'audit', updated_at = now() where id = p.id;
  elsif new.outcome = 'interested' then
    update public.scout_prospects set status = 'interested', updated_at = now() where id = p.id and status in ('new', 'visited', 'not_interested');
  else
    update public.scout_prospects set status = 'visited', updated_at = now() where id = p.id and status in ('new', 'not_interested');
  end if;
  return null;
end;
$$;
revoke all on function private.scout_visit_effect() from public, anon;

-- The database stamps the time; nobody can back-date a visit.
create function private.scout_visit_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.at := now();
  return new;
end;
$$;
revoke all on function private.scout_visit_stamp() from public, anon;
create trigger scout_visit_stamp before insert on public.scout_visits
  for each row execute function private.scout_visit_stamp();
-- After the row passed its security rules: move the prospect's status.
create trigger scout_visit_effect after insert on public.scout_visits
  for each row execute function private.scout_visit_effect();

revoke all on public.scout_visits from public, anon, authenticated;
grant select, insert on public.scout_visits to authenticated;
-- No update or delete grant: the log only grows.
alter table public.scout_visits enable row level security;
create policy scout_visits_read on public.scout_visits for select to authenticated
  using ((select private.my_role()) in ('owner', 'manager') or user_id = (select auth.uid()));
create policy scout_visits_add on public.scout_visits for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (
      (select private.my_role()) in ('owner', 'manager')
      or (
        (select private.my_role()) = 'sales'
        and exists (select 1 from public.scout_prospects p where p.id = prospect_id and p.assigned_to = (select auth.uid()) and p.archived_at is null)
      )
    )
  );
create policy scout_visits_requires_2fa on public.scout_visits as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

commit;
