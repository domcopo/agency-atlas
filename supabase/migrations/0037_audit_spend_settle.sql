-- Agency Atlas: audit caps count what a run really cost (approved by the owner 2026-11-25).
-- Numbered 0037 (next free after 0036 role guides). Needs 0023 (audit_spend) and 0035
-- (audit_runs).
--
-- Run ONCE in the Supabase SQL Editor. Before running it, check that today's daily backup
-- exists (Supabase > Database > Backups). Undo steps are at the end.
--
-- Why: a run writes its worst-case estimate to the add-only ledger (audit_spend) BEFORE it
-- starts, so the database can refuse anything over the caps. The real cost was never written
-- back, so caps filled 2-3x faster than real spending (a $1.42 estimate for a $0.49 run).
--
-- What this adds (no existing row is changed or deleted):
-- * audit_spend.kind  'reserve' (every row so far, and every row people add) or 'settle'.
-- * audit_spend.run_id  the run a 'settle' row belongs to (one per run at most).
-- * When a run's real cost is saved (audit_runs.actual_usd, set once by the person who
--   started it), the database adds ONE 'settle' row giving back the unused part of the
--   estimate, dated when the run started so the right week/month gets it back.
--   Safety floor: at least 30% of the estimate always stays counted, so a wrong or tampered
--   "real cost" can stretch the caps by at most ~3x, never remove them. (Real runs so far
--   cost 35-51% of their estimate.) A run that never finishes keeps its full estimate.
-- * People still cannot add 'settle' rows, change or delete any row. Caps are unchanged.

begin;

alter table public.audit_spend add column kind text not null default 'reserve' check (kind in ('reserve', 'settle'));
alter table public.audit_spend add column run_id uuid references public.audit_runs (id);
create unique index audit_spend_one_settle_per_run on public.audit_spend (run_id) where kind = 'settle';

-- Amounts: a reservation is positive; a settlement gives money back (negative).
alter table public.audit_spend drop constraint audit_spend_usd_check;
alter table public.audit_spend add constraint audit_spend_usd_check check (
  (kind = 'reserve' and usd > 0 and usd <= 50 and run_id is null)
  or (kind = 'settle' and usd < 0 and usd >= -50 and run_id is not null)
);

-- People may only add reservations (as before); settlements come from the trigger below.
drop policy audit_spend_add on public.audit_spend;
create policy audit_spend_add on public.audit_spend for insert to authenticated
  with check (
    kind = 'reserve' and run_id is null
    and user_id = (select auth.uid())
    and (select private.my_role()) in ('owner', 'manager', 'sales')
    and exists (select 1 from public.audits a where a.id = audit_id and a.archived_at is null)
  );

-- The cap check (0023) applies to reservations only: a settlement only lowers the total.
create or replace function private.audit_spend_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.audit_settings;
  ny_now timestamp := now() at time zone 'America/New_York';
  week_start timestamptz := date_trunc('week', ny_now) at time zone 'America/New_York';
  month_start timestamptz := date_trunc('month', ny_now) at time zone 'America/New_York';
  weekly numeric;
  used numeric;
begin
  if new.kind = 'settle' then
    -- Only the settle trigger can get here (the insert policy refuses 'settle' from people).
    return new;
  end if;
  new.at := now();
  select * into s from public.audit_settings where id;
  select coalesce(sum(usd), 0) into used from public.audit_spend where audit_id = new.audit_id;
  if used + new.usd > s.per_audit_usd then
    raise exception 'over the per-audit cap' using errcode = 'check_violation';
  end if;
  select coalesce((select weekly_usd from public.audit_user_limits where user_id = new.user_id), s.weekly_usd) into weekly;
  select coalesce(sum(usd), 0) into used from public.audit_spend where user_id = new.user_id and at >= week_start;
  if used + new.usd > weekly then
    raise exception 'over the weekly cap' using errcode = 'check_violation';
  end if;
  select coalesce(sum(usd), 0) into used from public.audit_spend where at >= month_start;
  if used + new.usd > s.monthly_usd then
    raise exception 'over the monthly cap' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- When a run's real cost is first saved, give back the unused part of its estimate.
create function private.audit_run_settle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  counted numeric;
  back numeric;
begin
  if old.actual_usd is not null or new.actual_usd is null then
    return new;
  end if;
  counted := greatest(new.actual_usd, round(new.est_usd * 0.30, 4));
  back := round(new.est_usd - counted, 4);
  if back > 0 then
    insert into public.audit_spend (audit_id, user_id, provider, usd, at, kind, run_id)
    values (new.audit_id, new.started_by, 'dataforseo', -back, new.started_at, 'settle', new.id)
    on conflict do nothing;
  end if;
  return new;
end;
$$;
revoke all on function private.audit_run_settle() from public, anon;
create trigger audit_run_settle after update of actual_usd on public.audit_runs
  for each row execute function private.audit_run_settle();

commit;

-- Undo (only if asked; settlements already given back stay in the ledger unless deleted by
-- the owner on purpose):
--   begin;
--   drop trigger audit_run_settle on public.audit_runs;
--   drop function private.audit_run_settle();
--   -- then re-run the private.audit_spend_guard() and audit_spend_add definitions from 0023
--   commit;
