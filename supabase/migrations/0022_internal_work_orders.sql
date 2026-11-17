-- Agency Atlas: work orders for our own agency (approved 2026-11-17, docs/PDF_AND_AGENCY_PLAN.md).
--
-- Run ONCE in the Supabase SQL Editor (after 0001-0021).
--
-- What this adds:
-- * actions.internal: a work order for the agency itself (our marketing, website, admin),
--   with no client and no lead. Only WORK ORDERS can be internal. It is set when the item
--   is added and can never be changed afterwards (no update permission on the column).
-- * The rule "exactly one client OR one lead" becomes "exactly one client, OR one lead,
--   OR internal". Every existing row already has a client or a lead, so none changes.
-- * my_work (developers' own items) also returns `internal`, so the app can label it.
-- Who sees internal work: owner and managers (like all work orders); a developer only when
-- it is assigned to them (the existing rules); salespeople never. No GoHighLevel, no AI.

begin;

alter table public.actions add column internal boolean not null default false;

-- Replace the unnamed "client or lead" check from 0006 (found by its definition).
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.actions'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%client_id IS NOT NULL%lead_ghl_id IS NOT NULL%'
  loop
    execute format('alter table public.actions drop constraint %I', c);
  end loop;
end;
$$;

alter table public.actions add constraint actions_one_owner_kind
  check (num_nonnulls(client_id, lead_ghl_id) + (case when internal then 1 else 0 end) = 1);
alter table public.actions add constraint actions_internal_work_orders_only
  check (not internal or kind = 'work_order');

-- Developers' own items: same view as 0019, plus `internal` at the end.
create or replace view public.my_work as
  select a.id, a.kind, a.title, a.notes, a.priority, a.status, a.due_on, a.done_at, a.created_at,
         c.slug as client_slug, c.name as client_name,
         a.blocked_reason, a.promised_on,
         a.steps, a.source_link, a.source_note, a.est_minutes,
         a.submitted_at, a.sent_back_count, a.review_note,
         a.steps_done,
         a.start_on, a.actual_minutes, a.links, a.reassign_reason, a.reassign_requested_at,
         a.internal
  from public.actions a
  left join public.clients c on c.id = a.client_id
  where (select auth.jwt() ->> 'aal') = 'aal2'
    and a.owner_staff_id is not null
    and a.owner_staff_id = (select private.my_staff_id())
    and a.status <> 'canceled'
    and (a.status <> 'done' or a.done_at > now() - interval '14 days')
    and a.trashed_at is null
    and c.trashed_at is null;

commit;
