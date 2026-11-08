-- Agency Atlas: a read-only owner summary for the owner's personal dashboard.
--
-- Run ONCE in the Supabase SQL Editor (after 0001-0011). Then set your key's
-- fingerprint (the SHA-256 of the key, 64 hex characters; never the key itself):
--
--   insert into private.owner_summary_key (id, token_sha256) values (1, '<fingerprint>')
--   on conflict (id) do update set token_sha256 = excluded.token_sha256, updated_at = now();
--
-- How it works (design B, approved 2026-11-08):
-- * While the owner is signed in (two-factor), the app builds a summary of TOTALS
--   only and saves it here (owner_summary_snapshots). No record-level data.
-- * The dashboard calls GET /api/owner-summary with its key. The app checks the key,
--   then calls ONE database function, owner_summary_latest(key), which checks the
--   key's fingerprint again, applies a rate limit, records the call, and returns the
--   latest saved summary. Nothing else.
--
-- The one approved exception: signed-out callers (role "anon") may run that one
-- function. They still can't read any table. Everything else still requires a
-- signed-in, two-factor session. Nothing can be edited or deleted.

begin;

-- 1. Saved summaries (owner publishes; totals only) -------------------------------
create table public.owner_summary_snapshots (
  id         uuid primary key default gen_random_uuid(),
  -- clock time (not transaction time), so "latest" is always well defined.
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid not null default auth.uid() references auth.users (id),
  content    jsonb not null
    check (octet_length(content::text) <= 200000)
    -- Safety net: never an email address or a phone number in a summary.
    check (content::text !~ '[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}')
    check (content::text !~ '(^|[^0-9])\(?[0-9]{3}\)?[-. ][0-9]{3}[-. ][0-9]{4}([^0-9]|$)')
);
create index owner_summary_snapshots_latest_idx on public.owner_summary_snapshots (created_at desc);

-- 2. Every dashboard read (written only by the function below) --------------------
create table public.owner_summary_calls (
  id          uuid primary key default gen_random_uuid(),
  at          timestamptz not null default now(),
  outcome     text not null check (outcome in ('ok', 'limited', 'no_snapshot')),
  snapshot_id uuid references public.owner_summary_snapshots (id) on delete restrict
);
create index owner_summary_calls_at_idx on public.owner_summary_calls (at desc);

revoke all on public.owner_summary_snapshots, public.owner_summary_calls from public, anon, authenticated;
grant select, insert on public.owner_summary_snapshots to authenticated;
grant select on public.owner_summary_calls to authenticated;

alter table public.owner_summary_snapshots enable row level security;
alter table public.owner_summary_calls     enable row level security;

create policy owner_summary_read on public.owner_summary_snapshots for select to authenticated
  using ((select private.my_role()) = 'owner');
create policy owner_summary_publish on public.owner_summary_snapshots for insert to authenticated
  with check ((select private.my_role()) = 'owner' and created_by = (select auth.uid()));
create policy owner_summary_calls_read on public.owner_summary_calls for select to authenticated
  using ((select private.my_role()) = 'owner');

create policy owner_summary_requires_2fa on public.owner_summary_snapshots as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');
create policy owner_summary_calls_requires_2fa on public.owner_summary_calls as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

-- 3. The key's fingerprint (private area: not reachable through the app's API) ----
create table private.owner_summary_key (
  id           integer primary key default 1 check (id = 1),
  token_sha256 text not null check (token_sha256 ~ '^[0-9a-f]{64}$'),
  updated_at   timestamptz not null default now()
);
revoke all on private.owner_summary_key from public, anon, authenticated;
-- Extra lock (the SQL Editor suggests it): no rules = nobody but the database itself.
alter table private.owner_summary_key enable row level security;

-- 4. The one read the dashboard can make -------------------------------------------
-- Returns null for a missing or wrong key (and records nothing, so wrong keys can't
-- fill the log). With the right key: {status: ok|limited|no_snapshot, ...}.
create or replace function public.owner_summary_latest(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  expected text;
  recent   integer;
  snap     record;
begin
  if p_token is null or char_length(p_token) < 32 or char_length(p_token) > 200 then
    return null;
  end if;
  select token_sha256 into expected from private.owner_summary_key where id = 1;
  -- Compares fingerprints, not keys, so timing reveals nothing useful about the key.
  if expected is null or expected <> encode(sha256(convert_to(p_token, 'UTF8')), 'hex') then
    return null;
  end if;
  -- Rate limit: at most 30 reads in any 10 minutes.
  select count(*) into recent from public.owner_summary_calls where at > now() - interval '10 minutes';
  if recent >= 30 then
    insert into public.owner_summary_calls (outcome) values ('limited');
    return jsonb_build_object('status', 'limited');
  end if;
  select id, created_at, content into snap
    from public.owner_summary_snapshots order by created_at desc limit 1;
  if snap.id is null then
    insert into public.owner_summary_calls (outcome) values ('no_snapshot');
    return jsonb_build_object('status', 'no_snapshot');
  end if;
  insert into public.owner_summary_calls (outcome, snapshot_id) values ('ok', snap.id);
  return jsonb_build_object('status', 'ok', 'published_at', snap.created_at, 'content', snap.content);
end;
$$;
revoke all on function public.owner_summary_latest(text) from public, authenticated;
grant execute on function public.owner_summary_latest(text) to anon;

-- Tidy-up: the app's internal bookkeeping functions (run automatically when rows
-- change) never needed to be callable by signed-out callers. Remove that, so the
-- dashboard read above is the ONLY function anyone signed out can run.
revoke execute on function private.touch_updated_at() from public, anon;
revoke execute on function private.actions_developer_guard() from public, anon;
revoke execute on function private.actions_review_track() from public, anon;

commit;
