-- Agency Atlas: recent bot runs for the owner summary (approved 2026-11-12,
-- docs/BOT_RUNS_PLAN.md).
--
-- Run ONCE in the Supabase SQL Editor (after 0001-0017).
--
-- What this adds to the existing AI cost log (ai_usage). Nothing is deleted:
-- * run_ref    – a random 12-character code per run, set by THIS database (also for old
--                rows). It's what the owner summary shows instead of the database id.
-- * started_at – when the request was sent (new runs only; old rows stay blank).
-- * A failed request that never got a bill can now be logged with cost and tokens BLANK
--   (unknown), never 0. A run that worked must always have its exact cost.
--
-- Unchanged: owner and managers log their own AI requests; developers can't read or
-- write the log; nobody can edit or delete it; the budget adds up known costs only.

begin;

-- 1. A random code per run. Adding the column fills every old row with its own code.
alter table public.ai_usage
  add column run_ref text not null default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
alter table public.ai_usage add constraint ai_usage_run_ref_unique unique (run_ref);

-- The app can't choose the code: the database always sets it on insert.
create or replace function private.ai_usage_run_ref()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.run_ref := substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  return new;
end;
$$;
revoke all on function private.ai_usage_run_ref() from public, anon;

create trigger ai_usage_run_ref
  before insert on public.ai_usage
  for each row execute function private.ai_usage_run_ref();

-- 2. When the request was sent (at most an hour before it was logged, never after).
alter table public.ai_usage add column started_at timestamptz;
alter table public.ai_usage add constraint ai_usage_started_ok
  check (started_at is null or (started_at <= created_at + interval '1 minute' and started_at >= created_at - interval '1 hour'));

-- 3. Unknown cost only for failed runs, and then the token counts are unknown too.
alter table public.ai_usage
  alter column cost_usd drop not null,
  alter column input_tokens drop not null,
  alter column output_tokens drop not null,
  alter column cache_read_tokens drop not null,
  alter column cache_write_tokens drop not null;
alter table public.ai_usage add constraint ai_usage_cost_known
  check (
    (cost_usd is not null and input_tokens is not null and output_tokens is not null
       and cache_read_tokens is not null and cache_write_tokens is not null)
    or
    (cost_usd is null and input_tokens is null and output_tokens is null
       and cache_read_tokens is null and cache_write_tokens is null and outcome = 'error')
  );

commit;
