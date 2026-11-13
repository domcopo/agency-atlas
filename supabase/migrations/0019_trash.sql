-- Agency Atlas: Trash (approved 2026-11-12, docs/TRASH_PLAN.md).
--
-- Run ONCE in the Supabase SQL Editor (after 0001-0018).
--
-- What this adds:
-- * clients.trashed_at/trashed_by and actions.trashed_at/trashed_by: "in Trash".
--   The database stamps who and when; restoring clears both.
-- * Owner and managers can move things to Trash and restore them. Developers can't.
--   (Managers still can't change anything else about a client.)
-- * A client with billing records or a billing match can't go to Trash (money records
--   can't vanish by accident).
-- * DELETE FOREVER: only the owner, only for things already in Trash. Everything
--   attached (check-ins, timeline, comments, history, notices, AI profile, health
--   history, GoHighLevel link) goes with it, in one step. Every other delete is still
--   refused. GoHighLevel itself is never touched.
-- * deletion_log: what TYPE was deleted, by whom and when. No names, no contents.
--   Written ONLY by this database; only the owner reads it.
-- * Developers never see trashed items (or items of a trashed client): their views, their
--   work orders, comments and history all skip them.

begin;

-- ---------------------------------------------------------------------------
-- 1. Trash columns
-- ---------------------------------------------------------------------------
alter table public.clients
  add column trashed_at timestamptz,
  add column trashed_by uuid references auth.users (id);
alter table public.actions
  add column trashed_at timestamptz,
  add column trashed_by uuid references auth.users (id);
create index clients_trashed_idx on public.clients (trashed_at) where trashed_at is not null;
create index actions_trashed_idx on public.actions (trashed_at) where trashed_at is not null;

grant update (trashed_at) on public.actions to authenticated;
-- clients: the table-wide update grant already exists (0001); the rules below limit it.

-- Is this client in Trash? (Used by developer rules, which can't read clients directly.)
create function private.client_trashed(p_client uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select c.trashed_at is not null from public.clients c where c.id = p_client), false)
$$;
revoke all on function private.client_trashed(uuid) from public, anon;
grant execute on function private.client_trashed(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Moving to Trash and restoring: owner and managers; stamped by the database
-- ---------------------------------------------------------------------------
create function private.trash_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.trashed_at is not distinct from old.trashed_at then
    new.trashed_by := old.trashed_by; -- nobody edits who trashed it
    return new;
  end if;
  if (select private.my_role()) is distinct from 'owner' and (select private.my_role()) is distinct from 'manager' then
    raise exception 'only the owner or a manager can move things to Trash or restore them'
      using errcode = 'insufficient_privilege';
  end if;
  if new.trashed_at is null then
    new.trashed_by := null;                       -- restored
  else
    new.trashed_at := now();                      -- the database's clock, not the app's
    new.trashed_by := (select auth.uid());
  end if;
  return new;
end;
$$;
revoke all on function private.trash_rules() from public, anon;

create trigger actions_trash before update on public.actions
  for each row execute function private.trash_rules();
create trigger clients_trash before update on public.clients
  for each row execute function private.trash_rules();

-- Clients: managers may ONLY move to Trash / restore. Billing blocks Trash.
create function private.clients_trash_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select private.my_role()) = 'manager'
     and (to_jsonb(new) - 'trashed_at' - 'trashed_by' - 'updated_at')
         is distinct from (to_jsonb(old) - 'trashed_at' - 'trashed_by' - 'updated_at') then
    raise exception 'managers can only move clients to Trash or restore them'
      using errcode = 'insufficient_privilege';
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
revoke all on function private.clients_trash_guard() from public, anon;

create trigger clients_trash_guard before update on public.clients
  for each row execute function private.clients_trash_guard();

-- Managers may run an update on clients, but the guard above lets them change only Trash.
create policy clients_trash_manager on public.clients for update to authenticated
  using ((select private.my_role()) = 'manager')
  with check ((select private.my_role()) = 'manager');

-- ---------------------------------------------------------------------------
-- 3. Developers never see trashed work (or work of a trashed client)
-- ---------------------------------------------------------------------------
create policy actions_hide_trash_dev on public.actions as restrictive for select to authenticated
  using (
    (select private.my_role()) is distinct from 'developer'
    or (trashed_at is null and (client_id is null or not private.client_trashed(client_id)))
  );

create or replace function private.can_see_work_order(p_action uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.actions a
    where a.id = p_action
      and a.kind = 'work_order'
      and (
        (select private.my_role()) in ('owner', 'manager')
        or ((select private.my_role()) = 'developer'
            and a.owner_staff_id is not null
            and a.owner_staff_id = (select private.my_staff_id())
            and a.status <> 'canceled'
            and a.trashed_at is null
            and (a.client_id is null or not private.client_trashed(a.client_id)))
      )
  )
$$;

create or replace view public.my_work as
  select a.id, a.kind, a.title, a.notes, a.priority, a.status, a.due_on, a.done_at, a.created_at,
         c.slug as client_slug, c.name as client_name,
         a.blocked_reason, a.promised_on,
         a.steps, a.source_link, a.source_note, a.est_minutes,
         a.submitted_at, a.sent_back_count, a.review_note,
         a.steps_done,
         a.start_on, a.actual_minutes, a.links, a.reassign_reason, a.reassign_requested_at
  from public.actions a
  left join public.clients c on c.id = a.client_id
  where (select auth.jwt() ->> 'aal') = 'aal2'
    and a.owner_staff_id is not null
    and a.owner_staff_id = (select private.my_staff_id())
    and a.status <> 'canceled'
    and (a.status <> 'done' or a.done_at > now() - interval '14 days')
    and a.trashed_at is null
    and c.trashed_at is null;

create or replace view public.my_client_contacts as
  select c.slug as client_slug,
         c.name as client_name,
         (select max(ci.happened_on) from public.check_ins ci where ci.client_id = c.id) as last_logged_on,
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

-- ---------------------------------------------------------------------------
-- 4. Delete forever: owner only, only from Trash; attached records go with it
-- ---------------------------------------------------------------------------
grant delete on public.clients, public.actions to authenticated;

create policy clients_delete_trashed on public.clients for delete to authenticated
  using ((select private.my_role()) = 'owner' and trashed_at is not null);
create policy actions_delete_trashed on public.actions for delete to authenticated
  using ((select private.my_role()) = 'owner' and (trashed_at is not null or private.client_trashed(client_id)));

-- Attached records follow their client / work item (billing stays "restrict": a client
-- with billing records can't be in Trash, so it can't be deleted either).
do $$
declare
  r record;
  fk text;
begin
  for r in
    select * from (values
      ('check_ins', 'client_id', 'clients'),
      ('atlas_answers', 'client_id', 'clients'),
      ('ghl_contact_links', 'client_id', 'clients'),
      ('ghl_contact_stats', 'client_id', 'clients'),
      ('ai_client_profiles', 'client_id', 'clients'),
      ('actions', 'client_id', 'clients'),
      ('activity', 'client_id', 'clients'),
      ('activity', 'action_id', 'actions'),
      ('client_health_daily', 'client_id', 'clients'),
      ('work_order_comments', 'action_id', 'actions'),
      ('work_order_history', 'action_id', 'actions'),
      ('notifications', 'action_id', 'actions')
    ) as t(tbl, col, parent)
  loop
    select con.conname into fk
    from pg_constraint con
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
    where con.contype = 'f'
      and con.conrelid = format('public.%I', r.tbl)::regclass
      and con.confrelid = format('public.%I', r.parent)::regclass
      and array_length(con.conkey, 1) = 1
      and att.attname = r.col;
    if fk is null then
      raise exception 'expected a link from %.% to %', r.tbl, r.col, r.parent;
    end if;
    execute format('alter table public.%I drop constraint %I', r.tbl, fk);
    execute format('alter table public.%I add constraint %I foreign key (%I) references public.%I (id) on delete cascade',
                   r.tbl, fk, r.col, r.parent);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Deletion record: type, who, when. No names, no contents.
-- ---------------------------------------------------------------------------
create table public.deletion_log (
  id          uuid primary key default gen_random_uuid(),
  deleted_at  timestamptz not null default now(),
  deleted_by  uuid references auth.users (id),
  kind        text not null check (kind in ('client', 'work_order', 'follow_up', 'issue')),
  with_client boolean not null default false
);
create index deletion_log_at_idx on public.deletion_log (deleted_at desc);

revoke all on public.deletion_log from public, anon, authenticated;
grant select on public.deletion_log to authenticated;
alter table public.deletion_log enable row level security;
create policy deletion_log_read on public.deletion_log for select to authenticated
  using ((select private.my_role()) = 'owner');
create policy deletion_log_requires_2fa on public.deletion_log as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

create function private.log_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'clients' then
    insert into public.deletion_log (deleted_by, kind) values ((select auth.uid()), 'client');
  else
    insert into public.deletion_log (deleted_by, kind, with_client)
    values (
      (select auth.uid()),
      old.kind,
      -- deleted together with its client (the client row is already gone)
      old.client_id is not null and not exists (select 1 from public.clients c where c.id = old.client_id)
    );
  end if;
  return old;
end;
$$;
revoke all on function private.log_deletion() from public, anon;

create trigger clients_log_deletion after delete on public.clients
  for each row execute function private.log_deletion();
create trigger actions_log_deletion after delete on public.actions
  for each row execute function private.log_deletion();

commit;
