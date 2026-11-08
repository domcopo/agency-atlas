-- Agency Atlas: the owner can cancel work (kept, never deleted), and quick add by AI.
--
-- Run ONCE in the Supabase SQL Editor (after 0001-0012).
--
-- What this adds (nothing existing is deleted; existing items keep their status):
-- * actions.status can now also be 'canceled'. Canceled items disappear from every
--   list, count and workload, but stay in the database and the client's history.
-- * actions.canceled_at – when it was canceled (set automatically).
-- * actions.cancel_note – optional reason ("Duplicate", "Client paused").
-- * AI cost log: a new feature, 'quick_add' (type, talk or photo → draft work orders).
--
-- Rules:
-- * ONLY THE OWNER can cancel or restore an item, or write the reason. Managers and
--   developers are refused by the database itself, not just by a hidden button.
-- * canceled_at is stamped by the database, so nobody can fake it.
-- * New items can't start out canceled.
-- * Developers never see canceled items (my_work and their contact view skip them).
-- * Still no deletes anywhere.

begin;

alter table public.actions drop constraint actions_status_check;
alter table public.actions add constraint actions_status_check
  check (status in ('open', 'in_progress', 'waiting', 'blocked', 'review', 'done', 'canceled'));

alter table public.actions
  add column canceled_at timestamptz,
  add column cancel_note text check (char_length(cancel_note) <= 200);

-- People write only the reason; the time is automatic. (The trigger below limits it to the owner.)
grant update (cancel_note) on public.actions to authenticated;

-- Owner-only cancel / restore. Named so it runs after the developer guard and before
-- review tracking (triggers run in name order).
create function private.actions_owner_cancel()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'canceled' then
      raise exception 'new items can''t start out canceled' using errcode = 'check_violation';
    end if;
    new.canceled_at := null;
    new.cancel_note := null;
    return new;
  end if;
  if ((new.status = 'canceled') is distinct from (old.status = 'canceled')
      or new.cancel_note is distinct from old.cancel_note)
     and (select private.my_role()) is distinct from 'owner' then
    raise exception 'only the owner can cancel or restore work'
      using errcode = 'insufficient_privilege';
  end if;
  if new.status = 'canceled' then
    new.canceled_at := case when old.status = 'canceled' then old.canceled_at else now() end;
  else
    -- Restored (or never canceled): no cancel time or reason.
    new.canceled_at := null;
    new.cancel_note := null;
  end if;
  return new;
end;
$$;
create trigger actions_owner_cancel before insert or update on public.actions
  for each row execute function private.actions_owner_cancel();
revoke execute on function private.actions_owner_cancel() from public, anon;

-- Canceling an item that's waiting for review isn't "sent back".
create or replace function private.actions_review_track()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'review' and old.status is distinct from 'review' then
    new.submitted_at := now();
  end if;
  if old.status = 'review' and new.status not in ('review', 'done', 'canceled')
     and (select private.my_role()) in ('owner', 'manager') then
    new.sent_back_count := old.sent_back_count + 1;
  end if;
  return new;
end;
$$;

-- Developers' views skip canceled items (same columns as before).
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
    and a.status <> 'canceled'
    and (a.status <> 'done' or a.done_at > now() - interval '14 days');

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
    and (
      c.owner_staff_id = (select private.my_staff_id())
      or exists (
        select 1 from public.actions a
        where a.client_id = c.id
          and a.owner_staff_id = (select private.my_staff_id())
          and a.status <> 'canceled'
          and (a.status <> 'done' or a.done_at > now() - interval '14 days')
      )
    );

-- AI: quick add (type, talk or photo → draft work orders) is cost-logged like the rest.
alter table public.ai_usage drop constraint ai_usage_feature_check;
alter table public.ai_usage add constraint ai_usage_feature_check
  check (feature in ('briefing', 'client_profile', 'work_orders', 'work_prompt', 'quick_add'));

commit;
