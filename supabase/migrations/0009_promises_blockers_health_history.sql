-- Agency Atlas: promises, blockers, and a daily health score history.
--
-- Run ONCE in the Supabase SQL Editor (after 0001-0008).
--
-- What this adds (nothing existing is deleted; existing items keep their status):
-- * actions.status can now also be 'blocked', with actions.blocked_reason
--   ("waiting on login details", "needs designer", ...).
-- * actions.promised_on – the date we PROMISED the client this would be done.
--   Empty = not a promise. Entered by a person (never read from messages).
-- * client_health_daily – one row per client per day: the 0–100 health score and
--   its band. Lets the app show "dropped 15 points this week". Insert-only: no
--   edits, no deletes, and only TODAY's row can be added (history can't be faked).
--
-- Rules: owner and managers work all items and save score history. Developers
-- may set their own items to blocked and say why, but cannot change the promise
-- date. Developers cannot read score history. Two-factor required, like every table.

begin;

-- 1. Blocked status + reason, and the promise date ---------------------------
alter table public.actions drop constraint actions_status_check;
alter table public.actions add constraint actions_status_check
  check (status in ('open', 'in_progress', 'waiting', 'blocked', 'done'));

alter table public.actions
  add column blocked_reason text check (char_length(blocked_reason) <= 200),
  add column promised_on    date check (promised_on > date '2020-01-01');

grant update (blocked_reason, promised_on) on public.actions to authenticated;
create index actions_promised_idx on public.actions (promised_on) where promised_on is not null;

-- Developers: status and blocked reason only (the promise date is a manager's call).
create or replace function private.actions_developer_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select private.my_role()) = 'developer' and (
       new.title is distinct from old.title
    or new.notes is distinct from old.notes
    or new.owner_staff_id is distinct from old.owner_staff_id
    or new.priority is distinct from old.priority
    or new.due_on is distinct from old.due_on
    or new.promised_on is distinct from old.promised_on
  ) then
    raise exception 'developers can only change the status of their own items'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

-- Developers' view gets the two new columns (added at the end; same filter as before).
create or replace view public.my_work as
  select a.id, a.kind, a.title, a.notes, a.priority, a.status, a.due_on, a.done_at, a.created_at,
         c.slug as client_slug, c.name as client_name,
         a.blocked_reason, a.promised_on
  from public.actions a
  left join public.clients c on c.id = a.client_id
  where (select auth.jwt() ->> 'aal') = 'aal2'
    and a.owner_staff_id is not null
    and a.owner_staff_id = (select private.my_staff_id())
    and (a.status <> 'done' or a.done_at > now() - interval '14 days');

-- 2. Daily health score history ----------------------------------------------
create table public.client_health_daily (
  client_id   uuid not null references public.clients (id) on delete restrict,
  day         date not null,
  score       smallint not null check (score between 0 and 100),
  level       text not null check (level in ('healthy', 'watch', 'at_risk')),
  recorded_by uuid not null default auth.uid() references auth.users (id),
  recorded_at timestamptz not null default now(),
  primary key (client_id, day)
);

revoke all on public.client_health_daily from public, anon, authenticated;
grant select, insert on public.client_health_daily to authenticated;
alter table public.client_health_daily enable row level security;

create policy health_daily_read on public.client_health_daily for select to authenticated
  using ((select private.my_role()) in ('owner', 'manager'));
-- Only today's row (a day either side for time zones), saved as yourself.
create policy health_daily_insert on public.client_health_daily for insert to authenticated
  with check (
    (select private.my_role()) in ('owner', 'manager')
    and recorded_by = (select auth.uid())
    and day between current_date - 1 and current_date + 1
  );
create policy health_daily_requires_2fa on public.client_health_daily as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

commit;
