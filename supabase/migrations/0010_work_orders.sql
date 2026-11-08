-- Agency Atlas: work orders, AI-drafted suggestions, and a developer contact view.
--
-- Run ONCE in the Supabase SQL Editor (after 0001-0009).
--
-- What this adds (nothing existing is deleted; existing items are unchanged):
-- * actions.kind can now also be 'work_order' (alongside follow-ups and issues).
-- * Work order details on actions:
--     steps        – a short step list, one step per line (typed by a person, or an
--                    AI draft a person reviewed and added).
--     source_link  – a link to the GoHighLevel conversation this came from (pasted by
--                    a person; https only). The app never reads that conversation.
--     source_note  – one line on where it came from ("client asked by text").
--     est_minutes  – rough time estimate, for workload.
--     ai_suggested – true when it started as an AI draft (set once, never changed).
-- * AI: two new cost-log features ('work_orders' drafts, 'work_prompt' helper) and a
--   new saved-result kind ('work_orders') for the drafts list.
-- * public.my_client_contacts – for developers: for the clients they work on, ONLY
--   the client's name and contact DATES (last logged contact, last time the client
--   reached out, last time we did, last call, unanswered count). No notes, no
--   message text, no revenue, no other clients.
--
-- Rules: owner and managers create and edit work orders. Developers may still only
-- change the status (and blocked reason) of their own items: the guard below now
-- also protects the new columns. Two-factor required, like every table.

begin;

-- 1. Work orders on the existing actions list ---------------------------------
alter table public.actions drop constraint actions_kind_check;
alter table public.actions add constraint actions_kind_check
  check (kind in ('follow_up', 'issue', 'work_order'));

alter table public.actions
  add column steps        text check (char_length(steps) <= 2000),
  add column source_link  text check (char_length(source_link) <= 500 and source_link ~ '^https://[^\s<>"]+$'),
  add column source_note  text check (char_length(source_note) <= 200),
  add column est_minutes  smallint check (est_minutes between 5 and 2400),
  add column ai_suggested boolean not null default false;

-- Editable later by owner/managers (developers are stopped by the guard).
-- ai_suggested is set when the item is added and can't be changed.
grant update (steps, source_link, source_note, est_minutes) on public.actions to authenticated;
create index actions_kind_idx on public.actions (kind, status);

-- Developers: status and blocked reason only, still.
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
    or new.steps is distinct from old.steps
    or new.source_link is distinct from old.source_link
    or new.source_note is distinct from old.source_note
    or new.est_minutes is distinct from old.est_minutes
  ) then
    raise exception 'developers can only change the status of their own items'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

-- Developers' view gets the work order details (added at the end; same filter as before).
create or replace view public.my_work as
  select a.id, a.kind, a.title, a.notes, a.priority, a.status, a.due_on, a.done_at, a.created_at,
         c.slug as client_slug, c.name as client_name,
         a.blocked_reason, a.promised_on,
         a.steps, a.source_link, a.source_note, a.est_minutes
  from public.actions a
  left join public.clients c on c.id = a.client_id
  where (select auth.jwt() ->> 'aal') = 'aal2'
    and a.owner_staff_id is not null
    and a.owner_staff_id = (select private.my_staff_id())
    and (a.status <> 'done' or a.done_at > now() - interval '14 days');

-- 2. AI: new features in the cost log, and saved work order drafts -------------
alter table public.ai_usage drop constraint ai_usage_feature_check;
alter table public.ai_usage add constraint ai_usage_feature_check
  check (feature in ('briefing', 'client_profile', 'work_orders', 'work_prompt'));

alter table public.ai_briefings drop constraint ai_briefings_kind_check;
alter table public.ai_briefings add constraint ai_briefings_kind_check
  check (kind in ('daily', 'work_orders'));

-- 3. Developers: contact DATES for the clients they work on ---------------------
-- "Their clients" = clients they own, or where they have an item open (or done in
-- the last 14 days). Like my_work, this view runs with the view owner's rights so it
-- can read the dates, but its WHERE clause only returns the signed-in developer's
-- clients, only with two-factor, and only these columns. Covered by break-in tests.
create view public.my_client_contacts as
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
    and (
      c.owner_staff_id = (select private.my_staff_id())
      or exists (
        select 1 from public.actions a
        where a.client_id = c.id
          and a.owner_staff_id = (select private.my_staff_id())
          and (a.status <> 'done' or a.done_at > now() - interval '14 days')
      )
    );
revoke all on public.my_client_contacts from public, anon, authenticated;
grant select on public.my_client_contacts to authenticated;

commit;
