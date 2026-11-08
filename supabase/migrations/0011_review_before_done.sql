-- Agency Atlas: developers send work for review; a manager approves it as done.
--
-- Run ONCE in the Supabase SQL Editor (after 0001-0010).
--
-- What this adds (nothing existing is deleted; existing items keep their status):
-- * actions.status can now also be 'review' ("Ready for review").
-- * actions.submitted_at    – when it was last sent for review (set automatically).
-- * actions.sent_back_count – how many times a manager sent it back (automatic).
-- * actions.review_note     – the manager's note when sending it back.
--
-- Rules:
-- * Developers can NOT mark work orders or issues done. They set "review"; the
--   owner or a manager approves (done) or sends it back. Developers can still
--   mark their own simple follow-ups done.
-- * submitted_at and sent_back_count are set by the database itself, so nobody
--   can fake them. Only the owner or managers can write a review note.
-- * Two-factor required, like every table.

begin;

alter table public.actions drop constraint actions_status_check;
alter table public.actions add constraint actions_status_check
  check (status in ('open', 'in_progress', 'waiting', 'blocked', 'review', 'done'));

alter table public.actions
  add column submitted_at    timestamptz,
  add column sent_back_count smallint not null default 0 check (sent_back_count between 0 and 1000),
  add column review_note     text check (char_length(review_note) <= 200);

-- Only the note is written by people (managers). The other two are automatic.
grant update (review_note) on public.actions to authenticated;
create index actions_review_idx on public.actions (status) where status = 'review';

-- Developers: status and blocked reason only; never "done" on work orders or issues.
create or replace function private.actions_developer_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select private.my_role()) = 'developer' then
    if new.title is distinct from old.title
      or new.notes is distinct from old.notes
      or new.owner_staff_id is distinct from old.owner_staff_id
      or new.priority is distinct from old.priority
      or new.due_on is distinct from old.due_on
      or new.promised_on is distinct from old.promised_on
      or new.steps is distinct from old.steps
      or new.source_link is distinct from old.source_link
      or new.source_note is distinct from old.source_note
      or new.est_minutes is distinct from old.est_minutes
      or new.submitted_at is distinct from old.submitted_at
      or new.sent_back_count is distinct from old.sent_back_count
      or new.review_note is distinct from old.review_note
    then
      raise exception 'developers can only change the status of their own items'
        using errcode = 'insufficient_privilege';
    end if;
    if new.status = 'done' and old.status <> 'done' and old.kind in ('work_order', 'issue') then
      raise exception 'work orders and issues need a manager''s review before they are done'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end;
$$;

-- Automatic review tracking. Runs AFTER the guard above (triggers run in name
-- order: "actions_developer_guard" < "actions_review_track"), so the guard sees
-- only what the person asked to change.
create or replace function private.actions_review_track()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'review' and old.status is distinct from 'review' then
    new.submitted_at := now();
  end if;
  -- Sent back = a manager moves it out of review to anything but done.
  if old.status = 'review' and new.status not in ('review', 'done')
     and (select private.my_role()) in ('owner', 'manager') then
    new.sent_back_count := old.sent_back_count + 1;
  end if;
  return new;
end;
$$;
create trigger actions_review_track before update on public.actions
  for each row execute function private.actions_review_track();

-- Developers' view gets the review details (added at the end; same filter as before).
create or replace view public.my_work as
  select a.id, a.kind, a.title, a.notes, a.priority, a.status, a.due_on, a.done_at, a.created_at,
         c.slug as client_slug, c.name as client_name,
         a.blocked_reason, a.promised_on,
         a.steps, a.source_link, a.source_note, a.est_minutes,
         a.submitted_at, a.sent_back_count, a.review_note
  from public.actions a
  left join public.clients c on c.id = a.client_id
  where (select auth.jwt() ->> 'aal') = 'aal2'
    and a.owner_staff_id is not null
    and a.owner_staff_id = (select private.my_staff_id())
    and (a.status <> 'done' or a.done_at > now() - interval '14 days');

commit;
