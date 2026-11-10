-- Agency Atlas: tick boxes for work order steps (developer work screen).
--
-- Run ONCE in the Supabase SQL Editor (after 0001-0015).
--
-- What this adds (nothing existing is deleted or changed):
-- * actions.steps_done – which steps are ticked, numbered from 1 (e.g. {1,3}).
--
-- Rules (enforced HERE, not just by the screen):
-- * Developers can tick steps only on THEIR OWN items: the existing row rules (0007)
--   already limit their updates to their own items, and the developer guard still
--   refuses every other column (title, steps, dates, owner…). steps_done is simply
--   allowed alongside status.
-- * Only step numbers that exist (1 to the number of steps), no duplicates, kept in order.
-- * When someone changes the steps text, the ticks are cleared, so nobody sees a stale "done".
-- * Developers see their ticks in their own view (my_work gains the column).
-- * Still no deletes anywhere.

begin;

alter table public.actions
  add column steps_done smallint[] not null default '{}'
    check (cardinality(steps_done) <= 20);

grant update (steps_done) on public.actions to authenticated;

-- Check and tidy the ticks; clear them when the steps change. Runs after the developer
-- guard and the review tracking (triggers run in name order).
create or replace function private.actions_steps_done()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  n int := cardinality(array_remove(regexp_split_to_array(coalesce(new.steps, ''), E'\n'), ''));
  bad int;
begin
  if tg_op = 'UPDATE' and new.steps is distinct from old.steps then
    new.steps_done := '{}';
    return new;
  end if;
  select count(*) into bad from unnest(new.steps_done) as s(v) where v is null or v < 1 or v > n;
  if bad > 0 then
    raise exception 'that step does not exist' using errcode = 'check_violation';
  end if;
  if cardinality(new.steps_done) <> (select count(distinct v) from unnest(new.steps_done) as s(v)) then
    raise exception 'a step can only be ticked once' using errcode = 'check_violation';
  end if;
  new.steps_done := coalesce((select array_agg(v order by v) from unnest(new.steps_done) as s(v)), '{}');
  return new;
end;
$$;
revoke execute on function private.actions_steps_done() from public, anon;

create trigger actions_steps_done before insert or update on public.actions
  for each row execute function private.actions_steps_done();

-- Developers' own list: same rows and columns as before, plus the ticks (added last).
create or replace view public.my_work as
  select a.id, a.kind, a.title, a.notes, a.priority, a.status, a.due_on, a.done_at, a.created_at,
         c.slug as client_slug, c.name as client_name,
         a.blocked_reason, a.promised_on,
         a.steps, a.source_link, a.source_note, a.est_minutes,
         a.submitted_at, a.sent_back_count, a.review_note,
         a.steps_done
  from public.actions a
  left join public.clients c on c.id = a.client_id
  where (select auth.jwt() ->> 'aal') = 'aal2'
    and a.owner_staff_id is not null
    and a.owner_staff_id = (select private.my_staff_id())
    and a.status <> 'canceled'
    and (a.status <> 'done' or a.done_at > now() - interval '14 days');

commit;
