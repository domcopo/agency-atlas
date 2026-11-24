-- Agency Atlas: client journey + status changes (client care Step 1B, approved 2026-11-24,
-- docs/CLIENT_CARE_PLAN.md).
--
-- Run ONCE in the Supabase SQL Editor, after 0025_client_care.sql (0024 Scout, 0026 and
-- 0027 can run in any order around it). Check today's backup first. Undo steps are at the end.
--
-- What this adds:
-- * care_touches          – each journey touch marked Done or Skipped (add-only). Owner and
--                           managers read and log, always as themselves.
-- * client_status_changes – add-only log of every Active / Paused / Lost change, with a
--                           reason. Nobody can edit or delete it.
-- * clients.memory_goal / memory_tone / memory_next_ask – short "client memory" notes.
-- * Managers may now change a client's status, end date, journey start and memory (still
--   nothing else). A manager's status change only goes through if they logged it first.
-- * The owner gets an in-app notice when a manager marks a client lost.
-- Nothing is deleted. Trash and Delete forever stay owner-only, as before.

begin;

-- ---------------------------------------------------------------------------
-- 1. Journey touches (Done / Skipped). Steps 1-27 = first 90 days; 101-103 = ongoing.
-- ---------------------------------------------------------------------------
create table public.care_touches (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients (id) on delete cascade,
  step        smallint not null check (step between 1 and 27 or step between 101 and 103),
  status      text not null check (status in ('done', 'skipped')),
  happened_on date not null check (happened_on > date '2020-01-01' and happened_on <= current_date + 1),
  channel     text check (channel in ('call', 'text', 'email', 'video')),
  note        text check (char_length(note) <= 300),
  logged_by   uuid not null default auth.uid() references auth.users (id),
  created_at  timestamptz not null default now(),
  -- Done says how; Skip says why.
  check (status = 'skipped' or channel is not null),
  check (status = 'done' or char_length(btrim(coalesce(note, ''))) > 0)
);
create index care_touches_client_idx on public.care_touches (client_id, created_at desc);

revoke all on public.care_touches from public, anon, authenticated;
grant select, insert on public.care_touches to authenticated;
alter table public.care_touches enable row level security;
create policy care_touches_read on public.care_touches for select to authenticated
  using ((select private.my_role()) in ('owner', 'manager'));
create policy care_touches_add on public.care_touches for insert to authenticated
  with check ((select private.my_role()) in ('owner', 'manager') and logged_by = (select auth.uid()));
create policy care_touches_requires_2fa on public.care_touches as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

-- ---------------------------------------------------------------------------
-- 2. Status log (Active / Paused / Lost). Add-only; the database sets the time.
-- ---------------------------------------------------------------------------
create table public.client_status_changes (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients (id) on delete cascade,
  from_status text not null,
  to_status   text not null check (to_status in ('active', 'paused', 'canceled')),
  reason      text check (reason in ('price', 'results', 'in_house', 'closed', 'no_reply', 'other', 'back')),
  note        text check (char_length(note) <= 300),
  changed_by  uuid not null default auth.uid() references auth.users (id),
  created_at  timestamptz not null default now(),
  -- Pausing or losing a client always needs a reason.
  check (to_status = 'active' or (reason is not null and reason <> 'back'))
);
create index client_status_changes_client_idx on public.client_status_changes (client_id, created_at desc);

create function private.status_change_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at := now();
  return new;
end;
$$;
revoke all on function private.status_change_stamp() from public, anon;
create trigger client_status_changes_stamp before insert on public.client_status_changes
  for each row execute function private.status_change_stamp();

revoke all on public.client_status_changes from public, anon, authenticated;
grant select, insert on public.client_status_changes to authenticated;
alter table public.client_status_changes enable row level security;
create policy client_status_changes_read on public.client_status_changes for select to authenticated
  using ((select private.my_role()) in ('owner', 'manager'));
create policy client_status_changes_add on public.client_status_changes for insert to authenticated
  with check ((select private.my_role()) in ('owner', 'manager') and changed_by = (select auth.uid()));
create policy client_status_changes_requires_2fa on public.client_status_changes as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

-- ---------------------------------------------------------------------------
-- 3. Client memory
-- ---------------------------------------------------------------------------
alter table public.clients
  add column memory_goal     text check (char_length(memory_goal) <= 120),
  add column memory_tone     text check (char_length(memory_tone) <= 120),
  add column memory_next_ask text check (char_length(memory_next_ask) <= 120);
grant select (memory_goal, memory_tone, memory_next_ask) on public.clients to authenticated;
grant update (memory_goal, memory_tone, memory_next_ask) on public.clients to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Managers: status, end date, journey start, memory and Trash; nothing else.
--    A manager's status change must already be in the status log (same person, minutes ago).
-- ---------------------------------------------------------------------------
create or replace function private.clients_trash_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  manager_may text[] := array['trashed_at', 'trashed_by', 'updated_at', 'status', 'end_date',
                              'care_started_on', 'memory_goal', 'memory_tone', 'memory_next_ask'];
begin
  if (select private.my_role()) = 'manager' then
    if (to_jsonb(new) - manager_may) is distinct from (to_jsonb(old) - manager_may) then
      raise exception 'managers can only change status, journey start, client memory or Trash'
        using errcode = 'insufficient_privilege';
    end if;
    if new.status is distinct from old.status and not exists (
         select 1 from public.client_status_changes s
         where s.client_id = new.id and s.to_status = new.status
           and s.changed_by = (select auth.uid())
           and s.created_at > now() - interval '10 minutes'
       ) then
      raise exception 'a status change needs a reason in the status log first'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  if old.trashed_at is null and new.trashed_at is not null and (
       exists (select 1 from public.billing_contact_matches m where m.client_id = new.id)
       or exists (select 1 from public.billing_records r where r.client_id = new.id)
     ) then
    raise exception 'this client has billing records, so it can''t go to Trash'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Notice to the owner when a manager marks a client lost.
-- ---------------------------------------------------------------------------
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('assigned', 'unassigned', 'due_changed', 'comment', 'reassign_request', 'client_lost'));
alter table public.notification_settings drop constraint notification_settings_muted_check;
alter table public.notification_settings add constraint notification_settings_muted_check
  check (muted <@ array['assigned', 'unassigned', 'due_changed', 'comment', 'reassign_request', 'due_tomorrow', 'client_lost']::text[]);

create function private.notify_client_lost()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  client_name text;
begin
  if new.to_status <> 'canceled' or (select private.my_role()) is distinct from 'manager' then
    return new;
  end if;
  select c.name into client_name from public.clients c where c.id = new.client_id;
  insert into public.notifications (user_id, kind, action_id, title, actor)
  select tm.user_id, 'client_lost', null,
         left('Marked lost: ' || coalesce(client_name, 'a client') || ' (' || new.reason || ')', 200),
         new.changed_by
  from public.team_members tm
  where tm.role = 'owner'
    and not exists (select 1 from public.notification_settings ns where ns.user_id = tm.user_id and 'client_lost' = any (ns.muted));
  return new;
end;
$$;
revoke all on function private.notify_client_lost() from public, anon, authenticated;
create trigger client_status_changes_notify after insert on public.client_status_changes
  for each row execute function private.notify_client_lost();

commit;

-- ---------------------------------------------------------------------------
-- UNDO (only if something is wrong; one block in the SQL Editor). This removes the touch
-- and status logs written since, and the client memory notes.
--
-- begin;
-- drop trigger client_status_changes_notify on public.client_status_changes;
-- drop function private.notify_client_lost();
-- delete from public.notifications where kind = 'client_lost';
-- update public.notification_settings set muted = array_remove(muted, 'client_lost');
-- alter table public.notifications drop constraint notifications_kind_check;
-- alter table public.notifications add constraint notifications_kind_check
--   check (kind in ('assigned', 'unassigned', 'due_changed', 'comment', 'reassign_request'));
-- alter table public.notification_settings drop constraint notification_settings_muted_check;
-- alter table public.notification_settings add constraint notification_settings_muted_check
--   check (muted <@ array['assigned', 'unassigned', 'due_changed', 'comment', 'reassign_request', 'due_tomorrow']::text[]);
-- (then re-run section "2. Clients" guard from 0019_trash.sql to restore the old manager rule)
-- alter table public.clients drop column memory_goal, drop column memory_tone, drop column memory_next_ask;
-- drop table public.client_status_changes, public.care_touches;
-- drop function private.status_change_stamp();
-- commit;
-- ---------------------------------------------------------------------------
