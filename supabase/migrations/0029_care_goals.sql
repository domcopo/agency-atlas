-- Agency Atlas: calls-first touches, daily goals and the AI helper's cost log (client care
-- Step 1D, approved 2026-11-24, docs/CLIENT_CARE_PLAN.md).
--
-- Run ONCE in the Supabase SQL Editor, after 0028_client_journey.sql. Check today's backup
-- first. Undo steps are at the end.
--
-- What this adds:
-- * care_touches.status 'attempt' – a call nobody answered (voicemail + text). The touch
--   stays open and comes back the next working day.
-- * care_touches.outcome          – talked / voicemail / text_instead.
-- * care_targets                  – each person's daily goal in points (owner sets; you read
--                                   your own). Default 15 when there's no row.
-- * ai_usage features 'care_suggestions' and 'care_draft' so the AI helper's cost is logged.
-- Nothing is deleted.

begin;

-- ---------------------------------------------------------------------------
-- 1. Call attempts and outcomes
-- ---------------------------------------------------------------------------
alter table public.care_touches drop constraint care_touches_status_check;
alter table public.care_touches add constraint care_touches_status_check
  check (status in ('done', 'skipped', 'attempt'));
-- 0028 said "anything not done needs a note" (meant for Skip). Now only Skip needs a reason.
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.care_touches'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%status = ''done''::text%' and pg_get_constraintdef(oid) like '%btrim%'
  loop
    execute format('alter table public.care_touches drop constraint %I', c);
  end loop;
end;
$$;
alter table public.care_touches add constraint care_touches_skip_reason_check
  check (status <> 'skipped' or char_length(btrim(coalesce(note, ''))) > 0);
alter table public.care_touches
  add column outcome text check (outcome in ('talked', 'voicemail', 'text_instead'));
-- An attempt is always a call or video that wasn't answered; "talked" only fits a call or video.
alter table public.care_touches add constraint care_touches_attempt_check
  check (status <> 'attempt' or (channel in ('call', 'video') and outcome = 'voicemail'));
alter table public.care_touches add constraint care_touches_talked_check
  check (outcome is distinct from 'talked' or channel in ('call', 'video'));

-- ---------------------------------------------------------------------------
-- 2. Daily goals (points: a real conversation 3, a voicemail + text 1, a text or email 1)
-- ---------------------------------------------------------------------------
create table public.care_targets (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  daily_points smallint not null default 15 check (daily_points between 1 and 200),
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users (id)
);
create trigger care_targets_stamp before insert or update on public.care_targets
  for each row execute function private.care_stamp();

revoke all on public.care_targets from public, anon, authenticated;
grant select, insert on public.care_targets to authenticated;
grant update (daily_points) on public.care_targets to authenticated;
alter table public.care_targets enable row level security;
create policy care_targets_read on public.care_targets for select to authenticated
  using (user_id = (select auth.uid()) or (select private.my_role()) = 'owner');
create policy care_targets_add on public.care_targets for insert to authenticated
  with check ((select private.my_role()) = 'owner');
create policy care_targets_edit on public.care_targets for update to authenticated
  using ((select private.my_role()) = 'owner')
  with check ((select private.my_role()) = 'owner');
create policy care_targets_requires_2fa on public.care_targets as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

-- ---------------------------------------------------------------------------
-- 3. AI helper features in the cost log
-- ---------------------------------------------------------------------------
alter table public.ai_usage drop constraint ai_usage_feature_check;
alter table public.ai_usage add constraint ai_usage_feature_check
  check (feature in ('briefing', 'client_profile', 'work_orders', 'work_prompt', 'quick_add', 'care_suggestions', 'care_draft'));

commit;

-- ---------------------------------------------------------------------------
-- UNDO (only if something is wrong; one block in the SQL Editor). Removes call attempts
-- logged since, the goals, and the AI helper's cost rows.
--
-- begin;
-- delete from public.care_touches where status = 'attempt';
-- alter table public.care_touches drop constraint care_touches_attempt_check, drop constraint care_touches_talked_check;
-- alter table public.care_touches drop column outcome;
-- alter table public.care_touches drop constraint care_touches_skip_reason_check;
-- alter table public.care_touches add check (status = 'done' or char_length(btrim(coalesce(note, ''))) > 0);
-- alter table public.care_touches drop constraint care_touches_status_check;
-- alter table public.care_touches add constraint care_touches_status_check check (status in ('done', 'skipped'));
-- drop table public.care_targets;
-- commit;
-- (The AI cost log keeps the two extra feature names: its history is never deleted.)
-- ---------------------------------------------------------------------------
