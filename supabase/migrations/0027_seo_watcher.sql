-- Agency Atlas: SEO Watcher, Phase B (approved 2026-11-24, docs/SEO_WATCHER_PLAN.md).
--
-- Run ONCE in the Supabase SQL Editor (after 0001-0026; 0026 is the sales leaderboard,
-- which may come later: this file does not depend on it).
--
-- What this adds:
-- * watch_settings     – one row (owner edits): the monthly Watcher cap ($20) and the list
--                        limits per watched client (25 keywords, 5 cities, 5 competitors).
-- * watch_clients      – which clients are watched (the important ones, not all), their
--                        website and niche. Owner/managers add or pause; nobody deletes.
-- * watch_keywords, watch_markets, watch_competitors – each watched client's lists. The
--                        database refuses a list past its limit.
-- * watch_runs         – one round of checks: estimate written BEFORE it runs; the database
--                        refuses it if the month would go over the cap. Real cost recorded
--                        when results are attached (always recorded truthfully).
-- * watch_rank_checks  – add-only: one row per keyword × city × date (organic + Maps).
-- * watch_volumes      – add-only: monthly Google searches per keyword × city.
-- * public.watch_client_names – view: the watched clients a person may see, with names.
--
-- Who sees what:
--   owner, managers – everything; they edit the lists and attach results.
--   developers      – READ ONLY, and only clients they work on (same rule as
--                     my_client_contacts). Never costs, runs or settings.
--   salespeople     – nothing.
-- Nothing here talks to GoHighLevel or any outside service.

begin;

-- ---------------------------------------------------------------------------
-- 0. Helpers
-- ---------------------------------------------------------------------------
-- May the signed-in person see this client's Watcher data? Owner/managers: yes.
-- Developers: only clients they own or have open (or recently done) work on.
create function private.watch_can_see(p_client uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (select private.my_role()) in ('owner', 'manager') then true
    when (select private.my_role()) = 'developer' and (select private.my_staff_id()) is not null then exists (
      select 1 from public.clients c
      where c.id = p_client
        and c.trashed_at is null
        and (
          c.owner_staff_id = (select private.my_staff_id())
          or exists (
            select 1 from public.actions a
            where a.client_id = c.id
              and a.owner_staff_id = (select private.my_staff_id())
              and a.status <> 'canceled'
              and (a.status <> 'done' or a.done_at > now() - interval '14 days')
              and a.trashed_at is null
          )
        )
    )
    else false
  end
$$;
revoke all on function private.watch_can_see(uuid) from public, anon;
grant execute on function private.watch_can_see(uuid) to authenticated;

-- A bare website domain: lower case, at least one dot, no scheme or path.
create function private.watch_domain_ok(p text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$' and char_length(p) <= 120
$$;
revoke all on function private.watch_domain_ok(text) from public, anon;
grant execute on function private.watch_domain_ok(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Settings (one row)
-- ---------------------------------------------------------------------------
create table public.watch_settings (
  id                      boolean primary key default true check (id),
  monthly_usd             numeric(8, 2) not null default 20 check (monthly_usd between 0 and 1000),
  keywords_per_client     integer not null default 25 check (keywords_per_client between 1 and 200),
  markets_per_client      integer not null default 5 check (markets_per_client between 1 and 50),
  competitors_per_client  integer not null default 5 check (competitors_per_client between 1 and 50),
  updated_by              uuid references auth.users (id),
  updated_at              timestamptz not null default now()
);
insert into public.watch_settings (id) values (true);

revoke all on public.watch_settings from public, anon, authenticated;
grant select on public.watch_settings to authenticated;
grant update (monthly_usd, keywords_per_client, markets_per_client, competitors_per_client, updated_by, updated_at) on public.watch_settings to authenticated;
alter table public.watch_settings enable row level security;
create policy watch_settings_read on public.watch_settings for select to authenticated
  using ((select private.my_role()) in ('owner', 'manager'));
create policy watch_settings_edit on public.watch_settings for update to authenticated
  using ((select private.my_role()) = 'owner')
  with check ((select private.my_role()) = 'owner' and updated_by = (select auth.uid()));
create policy watch_settings_requires_2fa on public.watch_settings as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

-- ---------------------------------------------------------------------------
-- 2. Watched clients
-- ---------------------------------------------------------------------------
create table public.watch_clients (
  client_id   uuid primary key references public.clients (id) on delete cascade,
  domain      text not null check (private.watch_domain_ok(domain)),
  niche       text not null check (char_length(niche) between 1 and 60 and private.scout_clean(niche)),
  active      boolean not null default true,
  added_by    uuid not null default auth.uid() references auth.users (id),
  added_at    timestamptz not null default now()
);

revoke all on public.watch_clients from public, anon, authenticated;
grant select, insert on public.watch_clients to authenticated;
grant update (domain, niche, active) on public.watch_clients to authenticated;
alter table public.watch_clients enable row level security;
create policy watch_clients_read on public.watch_clients for select to authenticated
  using ((select private.watch_can_see(client_id)));
create policy watch_clients_add on public.watch_clients for insert to authenticated
  with check ((select private.my_role()) in ('owner', 'manager') and added_by = (select auth.uid()));
create policy watch_clients_edit on public.watch_clients for update to authenticated
  using ((select private.my_role()) in ('owner', 'manager'))
  with check ((select private.my_role()) in ('owner', 'manager'));
create policy watch_clients_requires_2fa on public.watch_clients as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

-- ---------------------------------------------------------------------------
-- 3. Lists: keywords, cities, competitors (limits enforced here, not just in the app)
-- ---------------------------------------------------------------------------
create table public.watch_keywords (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.watch_clients (client_id) on delete cascade,
  keyword     text not null check (
                char_length(keyword) between 2 and 80
                and keyword = lower(keyword)
                and keyword !~ '[<>{}\\]'
                and private.scout_clean(keyword)
              ),
  money       boolean not null default false,
  active      boolean not null default true,
  added_by    uuid not null default auth.uid() references auth.users (id),
  created_at  timestamptz not null default now(),
  unique (client_id, keyword)
);

create table public.watch_markets (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references public.watch_clients (client_id) on delete cascade,
  city           text not null check (char_length(city) between 2 and 60 and city !~ '[<>{}\\0-9@]'),
  state          text not null check (state ~ '^[A-Z]{2}$'),
  -- Filled in by hand or from the first results file; the USA map (Phase C) needs them.
  lat            numeric(8, 5) check (lat is null or lat between 17 and 72),
  lng            numeric(8, 5) check (lng is null or lng between -180 and -64),
  location_code  integer check (location_code is null or location_code between 1 and 99999999),
  active         boolean not null default true,
  added_by       uuid not null default auth.uid() references auth.users (id),
  created_at     timestamptz not null default now(),
  unique (client_id, city, state)
);

create table public.watch_competitors (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.watch_clients (client_id) on delete cascade,
  domain      text not null check (private.watch_domain_ok(domain)),
  source      text not null default 'manual' check (source in ('manual', 'audit', 'results')),
  active      boolean not null default true,
  added_by    uuid not null default auth.uid() references auth.users (id),
  created_at  timestamptz not null default now(),
  unique (client_id, domain)
);

-- Refuses a list entry past the client's limit (only active entries count). Also stamps
-- who added it and when, so nobody can back-date or add in someone else's name.
create function private.watch_list_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.watch_settings;
  lim integer;
  used integer;
begin
  if tg_op = 'INSERT' then
    new.added_by := auth.uid();
    new.created_at := now();
  else
    new.client_id := old.client_id;
    new.added_by := old.added_by;
    new.created_at := old.created_at;
  end if;
  if not new.active or (tg_op = 'UPDATE' and old.active) then
    return new;
  end if;
  select * into s from public.watch_settings where id;
  if tg_table_name = 'watch_keywords' then
    lim := s.keywords_per_client;
    select count(*) into used from public.watch_keywords where client_id = new.client_id and active and id <> new.id;
  elsif tg_table_name = 'watch_markets' then
    lim := s.markets_per_client;
    select count(*) into used from public.watch_markets where client_id = new.client_id and active and id <> new.id;
  else
    lim := s.competitors_per_client;
    select count(*) into used from public.watch_competitors where client_id = new.client_id and active and id <> new.id;
  end if;
  if used >= lim then
    raise exception 'this client''s list is full (% of %)', used, lim using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke all on function private.watch_list_guard() from public, anon;
create trigger watch_keywords_guard before insert or update on public.watch_keywords
  for each row execute function private.watch_list_guard();
create trigger watch_markets_guard before insert or update on public.watch_markets
  for each row execute function private.watch_list_guard();
create trigger watch_competitors_guard before insert or update on public.watch_competitors
  for each row execute function private.watch_list_guard();

revoke all on public.watch_keywords, public.watch_markets, public.watch_competitors from public, anon, authenticated;
grant select, insert on public.watch_keywords, public.watch_markets, public.watch_competitors to authenticated;
grant update (money, active) on public.watch_keywords to authenticated;
grant update (lat, lng, location_code, active) on public.watch_markets to authenticated;
grant update (active) on public.watch_competitors to authenticated;
alter table public.watch_keywords enable row level security;
alter table public.watch_markets enable row level security;
alter table public.watch_competitors enable row level security;

create policy watch_keywords_read on public.watch_keywords for select to authenticated
  using ((select private.watch_can_see(client_id)));
create policy watch_keywords_add on public.watch_keywords for insert to authenticated
  with check ((select private.my_role()) in ('owner', 'manager'));
create policy watch_keywords_edit on public.watch_keywords for update to authenticated
  using ((select private.my_role()) in ('owner', 'manager'))
  with check ((select private.my_role()) in ('owner', 'manager'));
create policy watch_keywords_requires_2fa on public.watch_keywords as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

create policy watch_markets_read on public.watch_markets for select to authenticated
  using ((select private.watch_can_see(client_id)));
create policy watch_markets_add on public.watch_markets for insert to authenticated
  with check ((select private.my_role()) in ('owner', 'manager'));
create policy watch_markets_edit on public.watch_markets for update to authenticated
  using ((select private.my_role()) in ('owner', 'manager'))
  with check ((select private.my_role()) in ('owner', 'manager'));
create policy watch_markets_requires_2fa on public.watch_markets as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

create policy watch_competitors_read on public.watch_competitors for select to authenticated
  using ((select private.watch_can_see(client_id)));
create policy watch_competitors_add on public.watch_competitors for insert to authenticated
  with check ((select private.my_role()) in ('owner', 'manager'));
create policy watch_competitors_edit on public.watch_competitors for update to authenticated
  using ((select private.my_role()) in ('owner', 'manager'))
  with check ((select private.my_role()) in ('owner', 'manager'));
create policy watch_competitors_requires_2fa on public.watch_competitors as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

-- ---------------------------------------------------------------------------
-- 4. Runs: one round of checks. The estimate is checked against the monthly cap
--    BEFORE the round runs (months by calendar, New York time).
-- ---------------------------------------------------------------------------
create table public.watch_runs (
  id           uuid primary key default gen_random_uuid(),
  created_by   uuid not null default auth.uid() references auth.users (id),
  client_ids   uuid[] not null check (cardinality(client_ids) between 1 and 100),
  pairs        integer not null check (pairs between 1 and 20000),
  volumes      boolean not null default false,
  est_usd      numeric(8, 2) not null check (est_usd > 0 and est_usd <= 100),
  actual_usd   numeric(8, 4) check (actual_usd is null or actual_usd between 0 and 100),
  status       text not null default 'planned' check (status in ('planned', 'attached')),
  checks_saved integer check (checks_saved between 0 and 20000),
  attached_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index watch_runs_at_idx on public.watch_runs (created_at desc);

create function private.watch_run_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cap numeric;
  month_start timestamptz := date_trunc('month', now() at time zone 'America/New_York') at time zone 'America/New_York';
  used numeric;
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
    new.status := 'planned';
    new.actual_usd := null;
    new.checks_saved := null;
    new.attached_at := null;
    select monthly_usd into cap from public.watch_settings where id;
    select coalesce(sum(coalesce(actual_usd, est_usd)), 0) into used from public.watch_runs where created_at >= month_start;
    if used + new.est_usd > cap then
      raise exception 'over the monthly Watcher cap' using errcode = 'check_violation';
    end if;
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.client_ids := old.client_ids;
    new.pairs := old.pairs;
    new.volumes := old.volumes;
    new.est_usd := old.est_usd;
    if old.status = 'attached' then
      raise exception 'results are already attached to this run' using errcode = 'check_violation';
    end if;
    new.attached_at := now();
  end if;
  return new;
end;
$$;
revoke all on function private.watch_run_guard() from public, anon;
create trigger watch_run_guard before insert or update on public.watch_runs
  for each row execute function private.watch_run_guard();

revoke all on public.watch_runs from public, anon, authenticated;
grant select, insert on public.watch_runs to authenticated;
grant update (status, actual_usd, checks_saved) on public.watch_runs to authenticated;
alter table public.watch_runs enable row level security;
create policy watch_runs_read on public.watch_runs for select to authenticated
  using ((select private.my_role()) in ('owner', 'manager'));
create policy watch_runs_add on public.watch_runs for insert to authenticated
  with check ((select private.my_role()) in ('owner', 'manager') and created_by = (select auth.uid()));
create policy watch_runs_attach on public.watch_runs for update to authenticated
  using ((select private.my_role()) in ('owner', 'manager'))
  with check (status = 'attached');
create policy watch_runs_requires_2fa on public.watch_runs as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

-- ---------------------------------------------------------------------------
-- 5. Results: rank checks and search volumes (add-only)
-- ---------------------------------------------------------------------------
create table public.watch_rank_checks (
  id          uuid primary key default gen_random_uuid(),
  run_id      uuid references public.watch_runs (id),
  client_id   uuid not null references public.watch_clients (client_id) on delete cascade,
  keyword_id  uuid not null references public.watch_keywords (id) on delete cascade,
  market_id   uuid not null references public.watch_markets (id) on delete cascade,
  checked_on  date not null check (checked_on >= date '2020-01-01'),
  organic     integer check (organic is null or organic between 1 and 100),
  pack        integer check (pack is null or pack between 0 and 3),
  url         text check (url is null or (char_length(url) <= 300 and url ~ '^https?://[^\s<>"]+$')),
  others      jsonb not null default '[]' check (jsonb_typeof(others) = 'array' and jsonb_array_length(others) <= 20 and pg_column_size(others) <= 4000),
  source      text not null check (source in ('dataforseo', 'audit')),
  created_at  timestamptz not null default now(),
  unique (keyword_id, market_id, checked_on)
);
create index watch_rank_checks_client_idx on public.watch_rank_checks (client_id, checked_on);

create table public.watch_volumes (
  id          uuid primary key default gen_random_uuid(),
  run_id      uuid references public.watch_runs (id),
  client_id   uuid not null references public.watch_clients (client_id) on delete cascade,
  market_id   uuid not null references public.watch_markets (id) on delete cascade,
  keyword     text not null check (char_length(keyword) between 2 and 80),
  month       date not null check (month = date_trunc('month', month)::date and month >= date '2018-01-01'),
  volume      integer check (volume is null or volume between 0 and 100000000),
  cpc_usd     numeric(8, 2) check (cpc_usd is null or cpc_usd between 0 and 10000),
  source      text not null check (source in ('dataforseo', 'audit')),
  created_at  timestamptz not null default now(),
  unique (market_id, keyword, month)
);
create index watch_volumes_client_idx on public.watch_volumes (client_id, month);

-- Results must line up: the keyword and city belong to the same watched client, nothing is
-- dated in the future, and the times are the database's.
create function private.watch_result_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.created_at := now();
  if tg_table_name = 'watch_rank_checks' then
    if new.checked_on > (now() at time zone 'America/New_York')::date then
      raise exception 'check dated in the future' using errcode = 'check_violation';
    end if;
    if not exists (select 1 from public.watch_keywords k where k.id = new.keyword_id and k.client_id = new.client_id)
       or not exists (select 1 from public.watch_markets m where m.id = new.market_id and m.client_id = new.client_id) then
      raise exception 'keyword and city must belong to the same client' using errcode = 'check_violation';
    end if;
  else
    if new.month > date_trunc('month', now() at time zone 'America/New_York')::date then
      raise exception 'volume dated in the future' using errcode = 'check_violation';
    end if;
    if not exists (select 1 from public.watch_markets m where m.id = new.market_id and m.client_id = new.client_id) then
      raise exception 'city must belong to the client' using errcode = 'check_violation';
    end if;
  end if;
  if new.run_id is not null and not exists (select 1 from public.watch_runs r where r.id = new.run_id and r.status = 'planned') then
    raise exception 'results can only be added to a run that is still waiting for them' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke all on function private.watch_result_guard() from public, anon;
create trigger watch_rank_checks_guard before insert on public.watch_rank_checks
  for each row execute function private.watch_result_guard();
create trigger watch_volumes_guard before insert on public.watch_volumes
  for each row execute function private.watch_result_guard();

revoke all on public.watch_rank_checks, public.watch_volumes from public, anon, authenticated;
grant select, insert on public.watch_rank_checks, public.watch_volumes to authenticated;
-- No update or delete grant: history only grows.
alter table public.watch_rank_checks enable row level security;
alter table public.watch_volumes enable row level security;

create policy watch_rank_checks_read on public.watch_rank_checks for select to authenticated
  using ((select private.watch_can_see(client_id)));
create policy watch_rank_checks_add on public.watch_rank_checks for insert to authenticated
  with check ((select private.my_role()) in ('owner', 'manager') and (run_id is not null or source = 'audit'));
create policy watch_rank_checks_requires_2fa on public.watch_rank_checks as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

create policy watch_volumes_read on public.watch_volumes for select to authenticated
  using ((select private.watch_can_see(client_id)));
create policy watch_volumes_add on public.watch_volumes for insert to authenticated
  with check ((select private.my_role()) in ('owner', 'manager') and (run_id is not null or source = 'audit'));
create policy watch_volumes_requires_2fa on public.watch_volumes as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

-- ---------------------------------------------------------------------------
-- 6. Names for the watched clients a person may see (developers can't read
--    the clients table, so this view gives them name + slug for their own only).
-- ---------------------------------------------------------------------------
create view public.watch_client_names as
  select w.client_id, c.slug, c.name, c.start_date, c.services, w.domain, w.niche, w.active
  from public.watch_clients w
  join public.clients c on c.id = w.client_id
  where (select auth.jwt() ->> 'aal') = 'aal2'
    and c.trashed_at is null
    and (select private.watch_can_see(w.client_id));
revoke all on public.watch_client_names from public, anon, authenticated;
grant select on public.watch_client_names to authenticated;

commit;
