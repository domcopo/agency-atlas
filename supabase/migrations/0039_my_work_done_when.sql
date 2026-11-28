-- Agency Atlas: developers see "Done when" on their own items (approved 2026-11-27,
-- docs/WORK_HUB_PLAN.md "Next"). Needs 0038 first (it adds actions.done_when).
--
-- Run ONCE in the Supabase SQL Editor, after checking that today's daily backup exists.
--
-- * my_work (developers' own items) also returns `done_when`, at the end.
--   Same rows as before: only the signed-in person's own items, two-factor required,
--   no canceled, no trash, done items for 14 days. Same permissions (replacing a view
--   keeps its grants). No new table.
-- * Developers still can't change Done when: the 0038 trigger refuses everyone but the
--   owner and managers.
-- Nothing is removed. The app works before this is run (it reads the older columns).

begin;

-- Developers' own items: same view as 0022, plus `done_when` at the end.
create or replace view public.my_work as
  select a.id, a.kind, a.title, a.notes, a.priority, a.status, a.due_on, a.done_at, a.created_at,
         c.slug as client_slug, c.name as client_name,
         a.blocked_reason, a.promised_on,
         a.steps, a.source_link, a.source_note, a.est_minutes,
         a.submitted_at, a.sent_back_count, a.review_note,
         a.steps_done,
         a.start_on, a.actual_minutes, a.links, a.reassign_reason, a.reassign_requested_at,
         a.internal,
         a.done_when
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

-- UNDO (only if asked): a view can't drop a column with "create or replace", so drop and
-- re-create it exactly as 0022 has it, then re-grant:
-- begin;
-- drop view public.my_work;
-- (paste the 0022 "create or replace view public.my_work" statement here)
-- revoke all on public.my_work from public, anon, authenticated;
-- grant select on public.my_work to authenticated;
-- commit;
