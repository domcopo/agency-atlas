-- Agency Atlas: owners, next actions, light issue tracking, and an activity log.
--
-- Run ONCE in the Supabase SQL Editor (after 0001-0005).
--
-- What this adds (nothing existing is changed or deleted):
-- * clients.owner_staff_id  – who on the team owns the client (owner sets it).
-- * check_ins.kind          – what kind of contact it was (call, message, email...).
-- * actions                 – ONE simple list for follow-ups and issues:
--                             title, owner, priority, status, due date, short notes.
--                             Tied to a client (or later, a GoHighLevel lead copy).
-- * activity                – an insert-only history used for each client's timeline.
--
-- Rules: owner and managers read and work these; developers nothing yet (no logins).
-- Nothing can be deleted. An action's client, kind and creator can't be changed.
-- History rows can't be edited. Two-factor required, like every other table.
-- GoHighLevel stays read-only: lead actions live only in this app.

begin;

alter table public.clients
  add column owner_staff_id uuid references public.staff (id) on delete restrict;

alter table public.check_ins
  add column kind text not null default 'check_in'
    check (kind in ('check_in', 'call', 'message', 'email', 'meeting', 'note'));

create table public.actions (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid references public.clients (id) on delete restrict,
  lead_ghl_id    text check (lead_ghl_id ~ '^[A-Za-z0-9]{6,40}$'),
  kind           text not null default 'follow_up' check (kind in ('follow_up', 'issue')),
  title          text not null check (char_length(title) between 1 and 120),
  notes          text check (char_length(notes) <= 500),
  owner_staff_id uuid references public.staff (id) on delete restrict,
  priority       text not null default 'normal' check (priority in ('critical', 'high', 'normal', 'low')),
  status         text not null default 'open' check (status in ('open', 'in_progress', 'waiting', 'done')),
  due_on         date check (due_on > date '2020-01-01'),
  done_at        timestamptz,
  created_by     uuid not null default auth.uid() references auth.users (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- Exactly one of: a client, or a lead.
  check ((client_id is not null) <> (lead_ghl_id is not null))
);
create index actions_client_idx on public.actions (client_id, status);
create index actions_open_due_idx on public.actions (status, due_on);
create trigger actions_touch before update on public.actions
  for each row execute function private.touch_updated_at();

create table public.activity (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid references public.clients (id) on delete restrict,
  lead_ghl_id text check (lead_ghl_id ~ '^[A-Za-z0-9]{6,40}$'),
  action_id   uuid references public.actions (id) on delete restrict,
  kind        text not null check (kind in (
                'action_created', 'action_done', 'action_reopened', 'action_rescheduled',
                'action_assigned', 'action_status', 'owner_changed')),
  summary     text not null check (char_length(summary) between 1 and 200),
  actor       uuid not null default auth.uid() references auth.users (id),
  at          timestamptz not null default now()
);
create index activity_client_idx on public.activity (client_id, at desc);

-- Permissions: start from nothing, then grant only what's needed.
revoke all on public.actions, public.activity from public, anon, authenticated;
grant select, insert on public.actions to authenticated;
grant update (title, notes, owner_staff_id, priority, status, due_on, done_at) on public.actions to authenticated;
grant select, insert on public.activity to authenticated;

alter table public.actions  enable row level security;
alter table public.activity enable row level security;

create policy actions_read on public.actions for select to authenticated
  using ((select private.my_role()) in ('owner', 'manager'));
create policy actions_insert on public.actions for insert to authenticated
  with check ((select private.my_role()) in ('owner', 'manager') and created_by = (select auth.uid()));
create policy actions_update on public.actions for update to authenticated
  using ((select private.my_role()) in ('owner', 'manager'))
  with check ((select private.my_role()) in ('owner', 'manager'));

create policy activity_read on public.activity for select to authenticated
  using ((select private.my_role()) in ('owner', 'manager'));
create policy activity_insert on public.activity for insert to authenticated
  with check ((select private.my_role()) in ('owner', 'manager') and actor = (select auth.uid()));

-- Two-factor required, like every other table.
create policy actions_requires_2fa on public.actions as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');
create policy activity_requires_2fa on public.activity as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

commit;
