-- Agency Atlas: run audits inside Atlas (approved 2026-11-25, docs/AUDIT_RUN_PLAN.md, Phase E1).
-- Numbered 0035 (next free after 0034 BizToad Phase 3). Needs 0023 (saved audits) and 0005
-- (AI usage); it keeps every AI feature name added so far (0031 list + 'audit_words').
--
-- Run ONCE in the Supabase SQL Editor. Before running it, check that today's daily backup
-- exists (Supabase > Database > Backups). Undo steps are at the end.
--
-- What this adds (no existing data is changed):
-- * audit_runs     – one row per "Run audit": who started it, its steps, the worst-case
--                    estimate and the real cost, how it ended. Visible to whoever can see the
--                    audit (owner/managers: all; a salesperson: their own). Only the person
--                    who started a run can finish it. Never deleted.
-- * ai_usage       – new feature name 'audit_words' (Claude writes an audit's headline,
--                    notes and fixes from the finished numbers; no tools). A salesperson may
--                    log their OWN 'audit_words' cost rows. Reading the cost log stays
--                    owner/managers.
-- * ai_month_budget – a read-only view: this month's AI budget and total spent (one row, no
--                    details), so a salesperson's run can respect the budget without reading
--                    anyone's AI log. Owner, managers and salespeople, with two-factor.
-- The money itself is still capped by audit_spend (0023): the run writes its worst-case
-- estimate there FIRST, and the database refuses anything over the caps.
-- Nothing here talks to GoHighLevel or any outside service.

begin;

-- ---------------------------------------------------------------------------
-- 1. Audit runs
-- ---------------------------------------------------------------------------
create table public.audit_runs (
  id          uuid primary key default gen_random_uuid(),
  audit_id    uuid not null references public.audits (id),
  started_by  uuid not null default auth.uid() references auth.users (id),
  status      text not null default 'running' check (status in ('running', 'done', 'failed')),
  -- [{ "label": "Searches per city", "state": "done" }, …] (checked by the app too)
  steps       jsonb not null default '[]' check (jsonb_typeof(steps) = 'array' and pg_column_size(steps) <= 8000),
  est_usd     numeric(8, 4) not null check (est_usd >= 0 and est_usd <= 50),
  actual_usd  numeric(8, 4) check (actual_usd is null or (actual_usd >= 0 and actual_usd <= 50)),
  ai_usd      numeric(8, 4) check (ai_usd is null or (ai_usd >= 0 and ai_usd <= 10)),
  error       text check (char_length(error) <= 300),
  started_at  timestamptz not null default now(),
  finished_at timestamptz
);
create index audit_runs_audit_idx on public.audit_runs (audit_id, started_at desc);

revoke all on public.audit_runs from public, anon, authenticated;
grant select, insert on public.audit_runs to authenticated;
grant update (status, steps, actual_usd, ai_usd, error, finished_at) on public.audit_runs to authenticated;
alter table public.audit_runs enable row level security;

-- See a run when you can see its audit (the audits rules apply inside this check).
create policy audit_runs_read on public.audit_runs for select to authenticated
  using (exists (select 1 from public.audits a where a.id = audit_id));

-- Start a run as yourself, only on an audit you could edit: owner/managers any; a
-- salesperson only their own, not archived. A run always starts as "running".
create policy audit_runs_add on public.audit_runs for insert to authenticated
  with check (
    started_by = (select auth.uid())
    and status = 'running' and finished_at is null and actual_usd is null
    and (select private.my_role()) in ('owner', 'manager', 'sales')
    and exists (
      select 1 from public.audits a
      where a.id = audit_id
        and ((select private.my_role()) in ('owner', 'manager') or (a.created_by = (select auth.uid()) and a.archived_at is null))
    )
  );

-- Only the person who started a run moves it on, and only while it is running.
create policy audit_runs_finish on public.audit_runs for update to authenticated
  using (started_by = (select auth.uid()) and status = 'running')
  with check (started_by = (select auth.uid()));

create policy audit_runs_requires_2fa on public.audit_runs as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

-- ---------------------------------------------------------------------------
-- 2. AI usage: 'audit_words' (every feature so far is kept in the list)
-- ---------------------------------------------------------------------------
alter table public.ai_usage drop constraint ai_usage_feature_check;
alter table public.ai_usage add constraint ai_usage_feature_check
  check (feature in ('briefing', 'client_profile', 'work_orders', 'work_prompt', 'quick_add', 'ask_toad', 'care_suggestions', 'care_draft', 'audit_words'));

create policy ai_usage_insert_audit_words on public.ai_usage for insert to authenticated
  with check (feature = 'audit_words' and requested_by = (select auth.uid()) and (select private.my_role()) = 'sales');

-- ---------------------------------------------------------------------------
-- 3. This month's AI budget, as one number pair (no details)
-- ---------------------------------------------------------------------------
-- Like my_work (0007) and sales_leaderboard (0026): runs with the view owner's rights so it
-- can add up the month; its WHERE clause is the lock (two-factor + role) and it returns only
-- the budget and the total. Covered by the break-in tests (7cd).
create view public.ai_month_budget as
  select s.monthly_budget_usd as budget_usd,
         coalesce((
           select sum(u.cost_usd) from public.ai_usage u
           where u.created_at >= (date_trunc('month', now() at time zone 'America/New_York') at time zone 'America/New_York')
         ), 0)::numeric(10, 4) as spent_usd
  from public.ai_settings s
  where s.id = 1
    and (select auth.jwt() ->> 'aal') = 'aal2'
    and (select private.my_role()) in ('owner', 'manager', 'sales');

revoke all on public.ai_month_budget from public, anon, authenticated;
grant select on public.ai_month_budget to authenticated;

commit;

-- Undo (only if asked; first make sure no 'audit_words' rows need keeping):
--   begin;
--   drop view public.ai_month_budget;
--   drop policy ai_usage_insert_audit_words on public.ai_usage;
--   -- keep 'audit_words' in ai_usage_feature_check if any rows use it
--   drop table public.audit_runs;
--   commit;
