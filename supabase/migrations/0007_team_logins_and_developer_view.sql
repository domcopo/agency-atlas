-- Agency Atlas Phase 5: link each login to a team member, and give developers a
-- narrow view of their own work.
--
-- Run ONCE in the Supabase SQL Editor (after 0001-0006).
--
-- What this adds (nothing existing is changed or deleted):
-- * team_members.staff_id – which team member (staff row) a login belongs to.
--   The owner sets it in the SQL Editor when adding someone (see PHASE5_SETUP).
-- * Developers can now:
--     - read ONLY the actions (follow-ups/issues) assigned to them,
--     - change ONLY the status of those (open / in progress / waiting / done),
--     - log history rows for those actions.
--   They still cannot read the clients table (no revenue), check-ins, the sales
--   pipeline, AI, or anyone else's work. The client NAME for their own items comes
--   from one read-only view, public.my_work, which returns only safe columns.
-- * Owner and manager access is unchanged. Two-factor still required everywhere.

begin;

alter table public.team_members
  add column staff_id uuid unique references public.staff (id) on delete restrict;

-- The signed-in person's staff row (null if not linked).
create or replace function private.my_staff_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select staff_id from public.team_members where user_id = auth.uid()
$$;
revoke all on function private.my_staff_id() from public, anon;
grant execute on function private.my_staff_id() to authenticated;

-- Developers: read their own actions only.
create policy actions_read_own_dev on public.actions for select to authenticated
  using (
    (select private.my_role()) = 'developer'
    and owner_staff_id is not null
    and owner_staff_id = (select private.my_staff_id())
  );

-- Developers: update their own actions (the trigger below limits WHAT they can change).
create policy actions_update_own_dev on public.actions for update to authenticated
  using (
    (select private.my_role()) = 'developer'
    and owner_staff_id = (select private.my_staff_id())
  )
  with check (
    (select private.my_role()) = 'developer'
    and owner_staff_id = (select private.my_staff_id())
  );

-- A developer may only change status (and the matching done time).
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
  ) then
    raise exception 'developers can only change the status of their own items'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;
create trigger actions_developer_guard before update on public.actions
  for each row execute function private.actions_developer_guard();

-- Developers: log history for their own actions only.
create policy activity_insert_own_dev on public.activity for insert to authenticated
  with check (
    (select private.my_role()) = 'developer'
    and actor = (select auth.uid())
    and action_id is not null
    and exists (
      select 1 from public.actions a
      where a.id = action_id and a.owner_staff_id = (select private.my_staff_id())
    )
  );

-- Developers: their own items with the client's name, nothing else about the client.
-- A read-only view that runs with the view owner's rights (so it can look up the
-- client's NAME), but its WHERE clause only ever returns the signed-in person's own
-- items, and only with two-factor. Supabase's advisor may label this a "security
-- definer view": that is expected here; the filter below is the lock, and it is
-- covered by the break-in tests.
create view public.my_work as
  select a.id, a.kind, a.title, a.notes, a.priority, a.status, a.due_on, a.done_at, a.created_at,
         c.slug as client_slug, c.name as client_name
  from public.actions a
  left join public.clients c on c.id = a.client_id
  where (select auth.jwt() ->> 'aal') = 'aal2'
    and a.owner_staff_id is not null
    and a.owner_staff_id = (select private.my_staff_id())
    and (a.status <> 'done' or a.done_at > now() - interval '14 days');
revoke all on public.my_work from public, anon, authenticated;
grant select on public.my_work to authenticated;

commit;
