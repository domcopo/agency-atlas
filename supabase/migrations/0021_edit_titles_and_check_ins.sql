-- Agency Atlas: fix titles and logged check-ins (approved 2026-11-15, docs/EDIT_FIX_PLAN.md).
--
-- Run ONCE in the Supabase SQL Editor (after 0001-0020).
--
-- What this adds:
-- * check_ins: the owner and managers may fix a check-in's date, type, mood and note, or
--   REMOVE it (hidden, never deleted). Only the owner restores a removed one. Who logged it
--   and which client it's for can never change. The database stamps who/when.
-- * check_in_edits: every edit, removal and restore, with the old and new values.
--   Written ONLY by this database (trigger). Owner and managers read it. Nobody edits or
--   deletes it (it goes only when its client is deleted forever from Trash).
-- * Work order history now records title changes ("title"); the client timeline gets
--   'action_edited' lines ("Renamed: old -> new").
-- * Developers' contact dates (my_client_contacts) skip removed check-ins.
-- Titles: the owner and managers could already change them (0006); developers still can't
-- (developer guard, unchanged). Nothing here touches GoHighLevel or the AI.

begin;

-- ---------------------------------------------------------------------------
-- 1. Check-ins: edit and remove stamps
-- ---------------------------------------------------------------------------
alter table public.check_ins
  add column edited_at  timestamptz,
  add column edited_by  uuid references auth.users (id),
  add column removed_at timestamptz,
  add column removed_by uuid references auth.users (id);

-- Only these columns can be changed, and only by the owner and managers.
grant update (happened_on, note, mood, kind, removed_at) on public.check_ins to authenticated;
create policy check_ins_update on public.check_ins for update to authenticated
  using ((select private.my_role()) in ('owner', 'manager'))
  with check ((select private.my_role()) in ('owner', 'manager'));

-- ---------------------------------------------------------------------------
-- 2. The change record (written only by the trigger below)
-- ---------------------------------------------------------------------------
create table public.check_in_edits (
  id              uuid primary key default gen_random_uuid(),
  check_in_id     uuid not null references public.check_ins (id) on delete cascade,
  at              timestamptz not null default now(),
  actor           uuid references auth.users (id),
  change          text not null check (change in ('edited', 'removed', 'restored')),
  old_happened_on date,
  new_happened_on date,
  old_note        text check (char_length(old_note) <= 500),
  new_note        text check (char_length(new_note) <= 500),
  old_mood        text,
  new_mood        text,
  old_kind        text,
  new_kind        text
);
create index check_in_edits_check_in_idx on public.check_in_edits (check_in_id, at);

revoke all on public.check_in_edits from public, anon, authenticated;
grant select on public.check_in_edits to authenticated;
alter table public.check_in_edits enable row level security;
create policy check_in_edits_read on public.check_in_edits for select to authenticated
  using ((select private.my_role()) in ('owner', 'manager'));
create policy check_in_edits_requires_2fa on public.check_in_edits as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2') with check ((select auth.jwt() ->> 'aal') = 'aal2');

-- ---------------------------------------------------------------------------
-- 3. Rules for every change to a check-in (runs before it is saved)
-- ---------------------------------------------------------------------------
create function private.check_in_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  content boolean := new.happened_on is distinct from old.happened_on
    or new.note is distinct from old.note
    or new.mood is distinct from old.mood
    or new.kind is distinct from old.kind;
  removing boolean := old.removed_at is null and new.removed_at is not null;
  restoring boolean := old.removed_at is not null and new.removed_at is null;
begin
  -- Stamps come from this database, never from the app.
  new.edited_at := old.edited_at;
  new.edited_by := old.edited_by;
  new.removed_by := old.removed_by;
  if not removing and not restoring then
    new.removed_at := old.removed_at;
  end if;

  if new.happened_on > (now() at time zone 'America/New_York')::date + 1 then
    raise exception 'a check-in date cannot be in the future' using errcode = '23514';
  end if;
  if old.removed_at is not null and not restoring and content then
    raise exception 'restore this check-in before changing it' using errcode = '23514';
  end if;
  if restoring and (select private.my_role()) is distinct from 'owner' then
    raise exception 'only the owner restores a removed check-in' using errcode = '42501';
  end if;
  if (removing or restoring) and content then
    raise exception 'remove or restore on its own' using errcode = '23514';
  end if;

  if removing then
    new.removed_at := now();
    new.removed_by := me;
    insert into public.check_in_edits (check_in_id, actor, change) values (new.id, me, 'removed');
  elsif restoring then
    new.removed_by := null;
    insert into public.check_in_edits (check_in_id, actor, change) values (new.id, me, 'restored');
  elsif content then
    new.edited_at := now();
    new.edited_by := me;
    insert into public.check_in_edits
      (check_in_id, actor, change, old_happened_on, new_happened_on, old_note, new_note, old_mood, new_mood, old_kind, new_kind)
    values
      (new.id, me, 'edited', old.happened_on, new.happened_on, old.note, new.note, old.mood, new.mood, old.kind, new.kind);
  end if;
  return new;
end;
$$;
revoke all on function private.check_in_change() from public, anon, authenticated;
create trigger check_in_change before update on public.check_ins
  for each row execute function private.check_in_change();

-- ---------------------------------------------------------------------------
-- 4. Work order history: title changes
-- ---------------------------------------------------------------------------
alter table public.work_order_history drop constraint work_order_history_field_check;
alter table public.work_order_history add constraint work_order_history_field_check
  check (field in ('created', 'owner', 'status', 'due_on', 'start_on', 'priority', 'archived', 'reassign_request', 'title'));

create function private.work_order_title_track()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  who text;
begin
  if new.kind <> 'work_order' or new.title is not distinct from old.title then
    return null;
  end if;
  who := coalesce((select left(tm.display_name, 80) from public.team_members tm where tm.user_id = me), case when me is null then 'Setup' end);
  insert into public.work_order_history (action_id, actor, actor_name, field, old_value, new_value)
    values (new.id, me, who, 'title', left(old.title, 200), left(new.title, 200));
  return null;
end;
$$;
revoke all on function private.work_order_title_track() from public, anon, authenticated;
create trigger work_order_title_track after update of title on public.actions
  for each row execute function private.work_order_title_track();

-- Client timeline line for a renamed follow-up / issue / work order.
alter table public.activity drop constraint activity_kind_check;
alter table public.activity add constraint activity_kind_check check (kind in (
  'action_created', 'action_done', 'action_reopened', 'action_rescheduled',
  'action_assigned', 'action_status', 'owner_changed', 'billing_sync', 'action_edited'));

-- ---------------------------------------------------------------------------
-- 5. Developers' contact dates skip removed check-ins (same view as 0019 otherwise)
-- ---------------------------------------------------------------------------
create or replace view public.my_client_contacts as
  select c.slug as client_slug,
         c.name as client_name,
         (select max(ci.happened_on) from public.check_ins ci where ci.client_id = c.id and ci.removed_at is null) as last_logged_on,
         s.last_inbound_at,
         s.last_outbound_at,
         s.last_call_at,
         s.unanswered_outbound
  from public.clients c
  left join public.ghl_contact_stats s on s.client_id = c.id
  where (select auth.jwt() ->> 'aal') = 'aal2'
    and (select private.my_role()) = 'developer'
    and (select private.my_staff_id()) is not null
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
    );

commit;
