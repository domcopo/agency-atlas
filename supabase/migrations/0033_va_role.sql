-- Agency Atlas: the VA role (client care Step 1C, approved 2026-11-24, docs/CLIENT_CARE_PLAN.md).
--
-- Run ONCE in the Supabase SQL Editor, after 0032_client_care_extras.sql. Check today's
-- backup first. Undo steps are at the end.
--
-- A VA (virtual assistant) sees what client care needs and nothing else:
-- * reads: clients (same columns as managers: never amounts), tiers, staff names, check-ins,
--   journey touches, contact preferences + intake, escalations, GoHighLevel call/message
--   TIMES, the client's history, client follow-ups and issues (read-only; never work orders
--   or sales follow-ups), and Kit pages marked for VAs;
-- * writes (always as themselves): check-ins, touches, intake/contact preferences,
--   "Needs the owner", history lines, and the three client memory notes (nothing else on a
--   client: the client guard refuses it);
-- * va_requests: a VA ASKS to pause, mark lost or bring back a client; an owner or manager
--   approves (the change is then made as the approver) or turns it down. Nobody deletes one.
-- * notices: owners and managers hear about a new request; the VA hears the decision.
-- VAs never see prices, billing, work orders, leads, audits, Scout, Growth, AI, settings or Trash.

begin;

-- ---------------------------------------------------------------------------
-- 1. The role
-- ---------------------------------------------------------------------------
alter table public.team_members drop constraint team_members_role_check;
alter table public.team_members add constraint team_members_role_check
  check (role in ('owner', 'manager', 'developer', 'sales', 'va'));

-- ---------------------------------------------------------------------------
-- 2. What a VA may read
-- ---------------------------------------------------------------------------
create policy clients_read_va on public.clients for select to authenticated
  using ((select private.my_role()) = 'va');
create policy care_plans_read_va on public.care_plans for select to authenticated
  using ((select private.my_role()) = 'va');
create policy client_plans_read_va on public.client_plans for select to authenticated
  using ((select private.my_role()) = 'va');
create policy staff_read_va on public.staff for select to authenticated
  using ((select private.my_role()) = 'va');
create policy check_ins_read_va on public.check_ins for select to authenticated
  using ((select private.my_role()) = 'va');
create policy care_touches_read_va on public.care_touches for select to authenticated
  using ((select private.my_role()) = 'va');
create policy client_care_read_va on public.client_care for select to authenticated
  using ((select private.my_role()) = 'va');
create policy care_escalations_read_va on public.care_escalations for select to authenticated
  using ((select private.my_role()) = 'va');
create policy ghl_stats_read_va on public.ghl_contact_stats for select to authenticated
  using ((select private.my_role()) = 'va');
create policy activity_read_va on public.activity for select to authenticated
  using ((select private.my_role()) = 'va' and client_id is not null);
-- Client follow-ups and issues only: never work orders, never sales (lead) follow-ups, never Trash.
create policy actions_read_va on public.actions for select to authenticated
  using (
    (select private.my_role()) = 'va'
    and kind in ('follow_up', 'issue')
    and client_id is not null
    and trashed_at is null
  );

-- Kit pages: a 'va' audience, and the client care pages are shared with VAs.
alter table public.kit_docs drop constraint kit_docs_audience_check;
alter table public.kit_docs add constraint kit_docs_audience_check
  check (audience <@ array['manager', 'developer', 'sales', 'va']::text[]);
create policy kit_docs_read_va on public.kit_docs for select to authenticated
  using ((select private.my_role()) = 'va' and 'va' = any (audience) and not archived);
update public.kit_docs set audience = array_append(audience, 'va')
  where category = 'Client care' and not ('va' = any (audience));

-- ---------------------------------------------------------------------------
-- 3. What a VA may write (always as themselves)
-- ---------------------------------------------------------------------------
create policy check_ins_insert_va on public.check_ins for insert to authenticated
  with check ((select private.my_role()) = 'va' and logged_by = (select auth.uid()));
create policy care_touches_add_va on public.care_touches for insert to authenticated
  with check ((select private.my_role()) = 'va' and logged_by = (select auth.uid()));
create policy client_care_add_va on public.client_care for insert to authenticated
  with check ((select private.my_role()) = 'va');
create policy client_care_edit_va on public.client_care for update to authenticated
  using ((select private.my_role()) = 'va')
  with check ((select private.my_role()) = 'va');
create policy care_escalations_add_va on public.care_escalations for insert to authenticated
  with check ((select private.my_role()) = 'va' and raised_by = (select auth.uid()) and automatic = false);
create policy activity_insert_va on public.activity for insert to authenticated
  with check ((select private.my_role()) = 'va' and actor = (select auth.uid()) and client_id is not null);
-- Clients: only the three memory notes (the guard below refuses anything else).
create policy clients_memory_va on public.clients for update to authenticated
  using ((select private.my_role()) = 'va')
  with check ((select private.my_role()) = 'va');

create or replace function private.clients_trash_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  manager_may text[] := array['trashed_at', 'trashed_by', 'updated_at', 'status', 'end_date',
                              'care_started_on', 'memory_goal', 'memory_tone', 'memory_next_ask'];
  va_may text[] := array['updated_at', 'memory_goal', 'memory_tone', 'memory_next_ask'];
  who text := (select private.my_role());
begin
  if who = 'va' and (to_jsonb(new) - va_may) is distinct from (to_jsonb(old) - va_may) then
    raise exception 'VAs can only change client memory notes'
      using errcode = 'insufficient_privilege';
  end if;
  if who = 'manager' then
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
-- 4. VA requests: pause / mark lost / bring back, approved by an owner or manager
-- ---------------------------------------------------------------------------
create table public.va_requests (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.clients (id) on delete cascade,
  to_status    text not null check (to_status in ('active', 'paused', 'canceled')),
  reason       text not null check (reason in ('price', 'results', 'in_house', 'closed', 'no_reply', 'other', 'back')),
  note         text check (char_length(note) <= 300),
  requested_by uuid not null default auth.uid() references auth.users (id),
  created_at   timestamptz not null default now(),
  status       text not null default 'waiting' check (status in ('waiting', 'approved', 'declined')),
  decided_by   uuid references auth.users (id),
  decided_at   timestamptz,
  check (to_status = 'active' or reason <> 'back')
);
create index va_requests_waiting_idx on public.va_requests (created_at desc) where status = 'waiting';

-- The database sets the times and who decided; a request is decided once and never rewritten.
create function private.va_request_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.status := 'waiting';
    new.decided_by := null;
    new.decided_at := null;
  else
    if old.status <> 'waiting' then
      raise exception 'this request was already decided' using errcode = 'check_violation';
    end if;
    new.client_id := old.client_id;
    new.to_status := old.to_status;
    new.reason := old.reason;
    new.note := old.note;
    new.requested_by := old.requested_by;
    new.created_at := old.created_at;
    new.decided_by := (select auth.uid());
    new.decided_at := now();
  end if;
  return new;
end;
$$;
revoke all on function private.va_request_stamp() from public, anon;
create trigger va_requests_stamp before insert or update on public.va_requests
  for each row execute function private.va_request_stamp();

revoke all on public.va_requests from public, anon, authenticated;
grant select, insert on public.va_requests to authenticated;
grant update (status) on public.va_requests to authenticated;
alter table public.va_requests enable row level security;
create policy va_requests_read on public.va_requests for select to authenticated
  using ((select private.my_role()) in ('owner', 'manager') or requested_by = (select auth.uid()));
create policy va_requests_add on public.va_requests for insert to authenticated
  with check ((select private.my_role()) = 'va' and requested_by = (select auth.uid()));
create policy va_requests_decide on public.va_requests for update to authenticated
  using ((select private.my_role()) in ('owner', 'manager'))
  with check ((select private.my_role()) in ('owner', 'manager') and status in ('approved', 'declined'));
create policy va_requests_requires_2fa on public.va_requests as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

-- ---------------------------------------------------------------------------
-- 5. Notices: a new request (owners + managers), and the decision (the VA)
-- ---------------------------------------------------------------------------
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('assigned', 'unassigned', 'due_changed', 'comment', 'reassign_request', 'client_lost', 'needs_owner', 'va_request', 'va_decided'));
alter table public.notification_settings drop constraint notification_settings_muted_check;
alter table public.notification_settings add constraint notification_settings_muted_check
  check (muted <@ array['assigned', 'unassigned', 'due_changed', 'comment', 'reassign_request', 'due_tomorrow', 'client_lost', 'needs_owner', 'va_request', 'va_decided']::text[]);

create function private.notify_va_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  client_name text;
  word text := case new.to_status when 'active' then 'bring back' when 'paused' then 'pause' else 'mark lost' end;
begin
  select c.name into client_name from public.clients c where c.id = new.client_id;
  if tg_op = 'INSERT' then
    insert into public.notifications (user_id, kind, action_id, title, actor)
    select tm.user_id, 'va_request', null, left('VA asks to ' || word || ': ' || coalesce(client_name, 'a client'), 200), new.requested_by
    from public.team_members tm
    where tm.role in ('owner', 'manager')
      and not exists (select 1 from public.notification_settings ns where ns.user_id = tm.user_id and 'va_request' = any (ns.muted));
  elsif old.status = 'waiting' and new.status <> 'waiting' then
    insert into public.notifications (user_id, kind, action_id, title, actor)
    select new.requested_by, 'va_decided', null,
           left((case new.status when 'approved' then 'Approved: ' else 'Turned down: ' end) || word || ' ' || coalesce(client_name, 'a client'), 200),
           new.decided_by
    where not exists (select 1 from public.notification_settings ns where ns.user_id = new.requested_by and 'va_decided' = any (ns.muted));
  end if;
  return new;
end;
$$;
revoke all on function private.notify_va_request() from public, anon, authenticated;
create trigger va_requests_notify after insert or update on public.va_requests
  for each row execute function private.notify_va_request();

commit;

-- ---------------------------------------------------------------------------
-- UNDO (only if something is wrong; one block in the SQL Editor). First switch every VA
-- login to another role (update public.team_members set role = 'manager' where role = 'va').
--
-- begin;
-- drop trigger va_requests_notify on public.va_requests;
-- drop function private.notify_va_request();
-- delete from public.notifications where kind in ('va_request', 'va_decided');
-- update public.notification_settings set muted = array_remove(array_remove(muted, 'va_request'), 'va_decided');
-- alter table public.notifications drop constraint notifications_kind_check;
-- alter table public.notifications add constraint notifications_kind_check
--   check (kind in ('assigned', 'unassigned', 'due_changed', 'comment', 'reassign_request', 'client_lost', 'needs_owner'));
-- alter table public.notification_settings drop constraint notification_settings_muted_check;
-- alter table public.notification_settings add constraint notification_settings_muted_check
--   check (muted <@ array['assigned', 'unassigned', 'due_changed', 'comment', 'reassign_request', 'due_tomorrow', 'client_lost', 'needs_owner']::text[]);
-- drop table public.va_requests;
-- drop function private.va_request_stamp();
-- (re-run section 4 of 0028_client_journey.sql to restore the client guard without the VA rule)
-- drop policy clients_memory_va on public.clients; drop policy activity_insert_va on public.activity;
-- drop policy care_escalations_add_va on public.care_escalations; drop policy client_care_edit_va on public.client_care;
-- drop policy client_care_add_va on public.client_care; drop policy care_touches_add_va on public.care_touches;
-- drop policy check_ins_insert_va on public.check_ins; drop policy kit_docs_read_va on public.kit_docs;
-- update public.kit_docs set audience = array_remove(audience, 'va');
-- alter table public.kit_docs drop constraint kit_docs_audience_check;
-- alter table public.kit_docs add constraint kit_docs_audience_check check (audience <@ array['manager', 'developer', 'sales']::text[]);
-- drop policy actions_read_va on public.actions; drop policy activity_read_va on public.activity;
-- drop policy ghl_stats_read_va on public.ghl_contact_stats; drop policy care_escalations_read_va on public.care_escalations;
-- drop policy client_care_read_va on public.client_care; drop policy care_touches_read_va on public.care_touches;
-- drop policy check_ins_read_va on public.check_ins; drop policy staff_read_va on public.staff;
-- drop policy client_plans_read_va on public.client_plans; drop policy care_plans_read_va on public.care_plans;
-- drop policy clients_read_va on public.clients;
-- alter table public.team_members drop constraint team_members_role_check;
-- alter table public.team_members add constraint team_members_role_check check (role in ('owner', 'manager', 'developer', 'sales'));
-- commit;
-- ---------------------------------------------------------------------------
