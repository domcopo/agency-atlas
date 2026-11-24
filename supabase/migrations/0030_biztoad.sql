-- Agency Atlas: BizToad Phase 2, "Ask BizToad" (approved 2026-11-24, docs/BIZTOAD_PLAN.md
-- section 10).
--
-- ALREADY RUN by the owner on 2026-11-24, under its first name 0029_biztoad.sql. Renamed
-- 0030 when merging, because 0029 is Google Ads audits. Do NOT run it again. It doesn't
-- depend on 0028 or 0029 (and they don't depend on it), so the order they ran in is fine.
-- Undo steps are at the end.
--
-- What this adds:
-- * toad_settings – one row the owner controls: BizToad on/off for everyone, which roles may
--                   ask, the BizToad monthly total and the per-person monthly cap.
--                   Everyone on the team reads it; only the owner changes it.
-- * toad_spend    – add-only ledger. Before each question the app writes its worst-case cost
--                   here. The database refuses it when BizToad is off, the person's role isn't
--                   switched on, it would pass a cap or the whole-app AI budget (counting what
--                   was REALLY spent, from ai_usage), or the person asked less than 5 seconds
--                   ago / 30 times in the last hour. Nobody edits or deletes rows.
-- * ai_usage      – new feature name 'ask_toad'. A person whose role is switched on may log
--                   their OWN 'ask_toad' cost rows. Reading the cost log stays owner/managers.
-- Nothing here talks to GoHighLevel or any outside service. Questions and answers are never
-- stored anywhere.

begin;

-- ---------------------------------------------------------------------------
-- 1. Settings (one row)
-- ---------------------------------------------------------------------------
create table public.toad_settings (
  id              boolean primary key default true check (id),
  enabled         boolean not null default true,
  roles           text[] not null default '{owner,manager}'
                    check (roles <@ array['owner', 'manager', 'developer', 'sales']::text[] and cardinality(roles) <= 4),
  monthly_usd     numeric(8, 2) not null default 25 check (monthly_usd between 0 and 200),
  per_person_usd  numeric(8, 2) not null default 5 check (per_person_usd between 0 and 50),
  updated_by      uuid references auth.users (id),
  updated_at      timestamptz not null default now()
);
insert into public.toad_settings (id) values (true);

create function private.toad_settings_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.toad_settings_stamp() from public, anon;
create trigger toad_settings_stamp before update on public.toad_settings
  for each row execute function private.toad_settings_stamp();

revoke all on public.toad_settings from public, anon, authenticated;
grant select on public.toad_settings to authenticated;
grant update (enabled, roles, monthly_usd, per_person_usd) on public.toad_settings to authenticated;
alter table public.toad_settings enable row level security;
create policy toad_settings_read on public.toad_settings for select to authenticated
  using ((select private.my_role()) is not null);
create policy toad_settings_edit on public.toad_settings for update to authenticated
  using ((select private.my_role()) = 'owner')
  with check ((select private.my_role()) = 'owner');
create policy toad_settings_requires_2fa on public.toad_settings as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

-- Is the signed-in person allowed to ask BizToad right now? (on, and their role switched on)
create function private.toad_allowed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select s.enabled and (select role from public.team_members where user_id = auth.uid()) = any (s.roles)
     from public.toad_settings s where s.id),
    false)
$$;
revoke all on function private.toad_allowed() from public, anon;
grant execute on function private.toad_allowed() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Spending ledger (add-only). Months by calendar, New York time (like Scout).
-- ---------------------------------------------------------------------------
create table public.toad_spend (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null default auth.uid() references auth.users (id),
  usd      numeric(8, 4) not null check (usd > 0 and usd <= 1),
  at       timestamptz not null default now()
);
create index toad_spend_user_idx on public.toad_spend (user_id, at desc);
create index toad_spend_at_idx on public.toad_spend (at desc);

create function private.toad_spend_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.toad_settings;
  month_start timestamptz := date_trunc('month', now() at time zone 'America/New_York') at time zone 'America/New_York';
  -- A question's cost reaches ai_usage only when its answer is back. Until then (up to a few
  -- minutes) its reservation here counts instead. A finished one may briefly count twice,
  -- which only ever makes the check stricter.
  pending_since timestamptz := now() - interval '3 minutes';
  mine numeric;
  everyone numeric;
  all_ai numeric;
  budget numeric;
begin
  new.at := now();
  select * into s from public.toad_settings where id;
  if s.id is null or not s.enabled then
    raise exception 'toad: off' using errcode = 'check_violation';
  end if;

  if exists (select 1 from public.toad_spend where user_id = new.user_id and at > now() - interval '5 seconds') then
    raise exception 'toad: too fast' using errcode = 'check_violation';
  end if;
  if (select count(*) from public.toad_spend where user_id = new.user_id and at > now() - interval '1 hour') >= 30 then
    raise exception 'toad: hourly limit' using errcode = 'check_violation';
  end if;

  select coalesce(sum(cost_usd), 0) into mine from public.ai_usage
    where feature = 'ask_toad' and requested_by = new.user_id and created_at >= month_start;
  mine := mine + (select coalesce(sum(usd), 0) from public.toad_spend where user_id = new.user_id and at > pending_since);
  if mine + new.usd > s.per_person_usd then
    raise exception 'toad: over your monthly cap' using errcode = 'check_violation';
  end if;

  select coalesce(sum(cost_usd), 0) into everyone from public.ai_usage
    where feature = 'ask_toad' and created_at >= month_start;
  everyone := everyone + (select coalesce(sum(usd), 0) from public.toad_spend where at > pending_since);
  if everyone + new.usd > s.monthly_usd then
    raise exception 'toad: over the monthly total' using errcode = 'check_violation';
  end if;

  -- The whole-app AI budget (all features), set on the Safety page.
  select monthly_budget_usd into budget from public.ai_settings where id = 1;
  select coalesce(sum(cost_usd), 0) into all_ai from public.ai_usage where created_at >= month_start;
  all_ai := all_ai + (select coalesce(sum(usd), 0) from public.toad_spend where at > pending_since);
  if all_ai + new.usd > coalesce(budget, 0) then
    raise exception 'toad: over the AI budget' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke all on function private.toad_spend_guard() from public, anon;
create trigger toad_spend_guard before insert on public.toad_spend
  for each row execute function private.toad_spend_guard();

revoke all on public.toad_spend from public, anon, authenticated;
grant select, insert on public.toad_spend to authenticated;
-- No update or delete grant: the ledger only grows.
alter table public.toad_spend enable row level security;
create policy toad_spend_read on public.toad_spend for select to authenticated
  using ((select private.my_role()) in ('owner', 'manager') or user_id = (select auth.uid()));
create policy toad_spend_add on public.toad_spend for insert to authenticated
  with check (user_id = (select auth.uid()) and (select private.toad_allowed()));
create policy toad_spend_requires_2fa on public.toad_spend as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

-- ---------------------------------------------------------------------------
-- 3. The AI cost log: the new feature name, and who may log it.
-- ---------------------------------------------------------------------------
alter table public.ai_usage drop constraint ai_usage_feature_check;
alter table public.ai_usage add constraint ai_usage_feature_check
  check (feature in ('briefing', 'client_profile', 'work_orders', 'work_prompt', 'quick_add', 'ask_toad'));

-- Owner and managers already log any feature (0005). This adds: anyone whose role is
-- switched on for BizToad logs their own 'ask_toad' rows, and nothing else.
create policy ai_usage_insert_toad on public.ai_usage for insert to authenticated
  with check (feature = 'ask_toad' and requested_by = (select auth.uid()) and (select private.toad_allowed()));

commit;

-- ---------------------------------------------------------------------------
-- Undo (only if needed; run as one block). Deletes the BizToad settings and ledger.
-- ai_usage rows already logged as 'ask_toad' must be kept, so the feature name stays.
-- ---------------------------------------------------------------------------
-- begin;
-- drop policy ai_usage_insert_toad on public.ai_usage;
-- drop table public.toad_spend;
-- drop table public.toad_settings;
-- drop function private.toad_spend_guard();
-- drop function private.toad_allowed();
-- drop function private.toad_settings_stamp();
-- commit;
