-- Agency Atlas: Work hub fields (approved 2026-11-26, docs/WORK_HUB_PLAN.md). Numbered 0038
-- (0037 is taken by the audit spend fix on GitHub main, so this is 0038.)
--
-- Run ONCE in the Supabase SQL Editor. Before running it, check that today's daily backup
-- exists (Supabase > Database > Backups). Undo steps are at the end.
-- Nothing existing is changed or removed; the app works before this is run ("needs 0038").
--
-- What this adds:
-- * actions.done_when – one short line: "this is finished when…" (500 characters max).
--                       Only the owner and managers set or change it. Everyone who can
--                       already read an item (developers: their own) can read it.
-- * work_suggestion_dismissals – "Dismiss" on a suggestion in the Work hub (rule or AI draft). Records
--                       which client, which rule and which reason, by whom and when.
--                       Owner and managers only. Add-only: no edits, no deletes. A dismissed
--                       suggestion stays hidden while the reason is the same; a NEW reason
--                       (different text) shows again.
-- Two-factor (aal2) on the new table. No passwords or keys in any text.

begin;

-- ---------------------------------------------------------------------------
-- 1. Done when
-- ---------------------------------------------------------------------------
alter table public.actions
  add column done_when text
    check (done_when is null or char_length(btrim(done_when)) between 1 and 500),
  add constraint actions_done_when_no_secrets check (
    done_when is null or (
      done_when !~* '(password|passcode|passwd|pwd)\s*[:=]\s*\S'
      and done_when !~ 'sk-[A-Za-z0-9_-]{20,}'
      and done_when !~ '-----BEGIN [A-Z ]*PRIVATE KEY-----'
    )
  );

grant update (done_when) on public.actions to authenticated;

-- Only the owner and managers write it. Its own small trigger, so the existing developer
-- guard (0017) is not rewritten. Covers developers, sales and VAs alike.
create function private.actions_done_when_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select private.my_role()) is distinct from 'owner'
    and (select private.my_role()) is distinct from 'manager'
    and (
      (tg_op = 'INSERT' and new.done_when is not null)
      or (tg_op = 'UPDATE' and new.done_when is distinct from old.done_when)
    )
  then
    raise exception 'only the owner and managers can set "Done when"'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;
revoke execute on function private.actions_done_when_guard() from public, anon, authenticated;
create trigger actions_done_when_guard before insert or update on public.actions
  for each row execute function private.actions_done_when_guard();

-- ---------------------------------------------------------------------------
-- 2. Dismissed suggestions
-- ---------------------------------------------------------------------------
create table public.work_suggestion_dismissals (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients (id) on delete restrict,
  rule          text not null check (rule in ('risk', 'onboarding', 'routine', 'ai')),
  -- The suggestion's reason as the app words it ("why"). Same text = same reason.
  reason        text not null check (char_length(btrim(reason)) between 1 and 300),
  dismissed_by  uuid default auth.uid() references auth.users (id),
  dismissed_at  timestamptz not null default now(),
  constraint work_suggestion_dismissals_once unique (client_id, rule, reason),
  constraint work_suggestion_dismissals_no_secrets check (
    reason !~* '(password|passcode|passwd|pwd)\s*[:=]\s*\S'
    and reason !~ 'sk-[A-Za-z0-9_-]{20,}'
  )
);
create index work_suggestion_dismissals_client_idx on public.work_suggestion_dismissals (client_id, rule);

-- Who and when are always set by the database, never typed.
create function private.work_suggestion_dismissal_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.dismissed_by := auth.uid();
  new.dismissed_at := now();
  return new;
end;
$$;
revoke execute on function private.work_suggestion_dismissal_stamp() from public, anon, authenticated;
create trigger work_suggestion_dismissals_stamp before insert on public.work_suggestion_dismissals
  for each row execute function private.work_suggestion_dismissal_stamp();

revoke all on public.work_suggestion_dismissals from public, anon, authenticated;
grant select on public.work_suggestion_dismissals to authenticated;
grant insert (client_id, rule, reason) on public.work_suggestion_dismissals to authenticated;
alter table public.work_suggestion_dismissals enable row level security;

create policy work_suggestion_dismissals_read on public.work_suggestion_dismissals for select to authenticated
  using ((select private.my_role()) in ('owner', 'manager'));
create policy work_suggestion_dismissals_add on public.work_suggestion_dismissals for insert to authenticated
  with check ((select private.my_role()) in ('owner', 'manager'));
create policy work_suggestion_dismissals_requires_2fa on public.work_suggestion_dismissals as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2') with check ((select auth.jwt() ->> 'aal') = 'aal2');

commit;

-- ---------------------------------------------------------------------------
-- UNDO (only if something is wrong; one block in the SQL Editor). This removes every
-- "Done when" line and every saved dismissal. Nothing else is affected.
--
-- begin;
-- drop table public.work_suggestion_dismissals;
-- drop function private.work_suggestion_dismissal_stamp();
-- drop trigger actions_done_when_guard on public.actions;
-- drop function private.actions_done_when_guard();
-- alter table public.actions drop constraint actions_done_when_no_secrets;
-- alter table public.actions drop column done_when;
-- commit;
-- ---------------------------------------------------------------------------
