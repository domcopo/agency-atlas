-- Agency Atlas: Work Orders phase 1 (approved 2026-11-10, docs/WORK_ORDERS_V2_PLAN.md).
--
-- Run ONCE in the Supabase SQL Editor (after 0001-0016).
--
-- What this adds (nothing existing is deleted or changed):
-- * Work orders: start date, actual time spent, up to 5 https links, archive (owner),
--   and "Needs reassignment" (a developer asks, with a reason).
-- * work_order_comments – a comment thread per work order. Add-only.
-- * work_order_history  – who changed what, and when. Written ONLY by this database.
-- * notifications       – in-app notices. Written ONLY by this database.
-- * notification_settings – each person's muted notice kinds.
--
-- Rules (enforced HERE, not by the screen):
-- * Developers see and comment on only the work orders CURRENTLY assigned to them. When
--   one is reassigned, its comments and history disappear for them at once.
-- * Developers may change, on their own items: status, ticked steps, actual time, and ask
--   for reassignment. Nothing else (title, dates, links, owner, archive…).
-- * Only the owner archives or un-archives, and only finished or canceled work.
-- * Owner and managers create and reassign (unchanged); a reassignment clears the request.
-- * History and notifications can't be written, edited or deleted by anyone through the
--   app: triggers add them. Nobody can delete anything.
-- * Comments refuse obvious email addresses and phone numbers.
-- * Notices go only to the people involved, never to the person who made the change,
--   and never for a kind they muted. No schedules, no reminders, nothing sent outside Atlas.

begin;

-- ---------------------------------------------------------------------------
-- 1. New work order fields
-- ---------------------------------------------------------------------------
create or replace function private.https_links_ok(links text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(bool_and(char_length(l) between 11 and 500 and l ~ '^https://[^[:space:]<>"]+$' and l !~ '^https://[^/]*@'), true)
  from unnest(links) as t(l)
$$;
revoke all on function private.https_links_ok(text[]) from public, anon;
grant execute on function private.https_links_ok(text[]) to authenticated;

alter table public.actions
  add column start_on date,
  add column actual_minutes integer check (actual_minutes between 0 and 60000),
  add column links text[] not null default '{}'
    check (cardinality(links) <= 5 and private.https_links_ok(links)),
  add column archived_at timestamptz,
  add column reassign_reason text check (char_length(reassign_reason) between 1 and 200),
  add column reassign_requested_at timestamptz,
  add constraint actions_start_before_due check (start_on is null or due_on is null or start_on <= due_on);

-- People type these; the times are stamped by the trigger below.
grant update (start_on, actual_minutes, links, archived_at, reassign_reason) on public.actions to authenticated;

-- Developers: status, ticks, actual time and a reassignment request on their own items.
-- Same rules as before (0011), plus the new columns.
create or replace function private.actions_developer_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select private.my_role()) = 'developer' then
    if new.title is distinct from old.title
      or new.notes is distinct from old.notes
      or new.owner_staff_id is distinct from old.owner_staff_id
      or new.priority is distinct from old.priority
      or new.due_on is distinct from old.due_on
      or new.promised_on is distinct from old.promised_on
      or new.steps is distinct from old.steps
      or new.source_link is distinct from old.source_link
      or new.source_note is distinct from old.source_note
      or new.est_minutes is distinct from old.est_minutes
      or new.submitted_at is distinct from old.submitted_at
      or new.sent_back_count is distinct from old.sent_back_count
      or new.review_note is distinct from old.review_note
      or new.start_on is distinct from old.start_on
      or new.links is distinct from old.links
      or new.archived_at is distinct from old.archived_at
      or (new.reassign_reason is null and old.reassign_reason is not null)
    then
      raise exception 'developers can only change the status, steps, time and reassignment request of their own items'
        using errcode = 'insufficient_privilege';
    end if;
    if new.status = 'done' and old.status <> 'done' and old.kind in ('work_order', 'issue') then
      raise exception 'work orders and issues need a manager''s review before they are done'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end;
$$;

-- Archive (owner only, finished or canceled work) and the reassignment request.
-- Named to run after the guard, cancel and review triggers.
create function private.actions_work_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.archived_at := null;
    new.reassign_reason := null;
    new.reassign_requested_at := null;
    return new;
  end if;
  if new.archived_at is distinct from old.archived_at then
    if (select private.my_role()) is distinct from 'owner' then
      raise exception 'only the owner can archive work' using errcode = 'insufficient_privilege';
    end if;
    if new.archived_at is not null then
      if new.status not in ('done', 'canceled') then
        raise exception 'only finished or canceled work can be archived' using errcode = 'check_violation';
      end if;
      new.archived_at := coalesce(old.archived_at, now());
    end if;
  end if;
  -- A reassignment answers the request.
  if new.owner_staff_id is distinct from old.owner_staff_id then
    new.reassign_reason := null;
  end if;
  if new.reassign_reason is null then
    new.reassign_requested_at := null;
  elsif new.reassign_reason is distinct from old.reassign_reason then
    new.reassign_requested_at := now();
  else
    new.reassign_requested_at := old.reassign_requested_at;
  end if;
  return new;
end;
$$;
revoke execute on function private.actions_work_rules() from public, anon;
create trigger actions_work_rules before insert or update on public.actions
  for each row execute function private.actions_work_rules();

-- ---------------------------------------------------------------------------
-- 2. Comments (add-only)
-- ---------------------------------------------------------------------------
create table public.work_order_comments (
  id         uuid primary key default gen_random_uuid(),
  action_id  uuid not null references public.actions (id) on delete restrict,
  author     uuid not null default auth.uid() references auth.users (id),
  body       text not null check (char_length(body) between 1 and 2000)
    check (body !~ '[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}')
    check (body !~ '(^|[^0-9])\(?[0-9]{3}\)?[-. ][0-9]{3}[-. ][0-9]{4}([^0-9]|$)'),
  created_at timestamptz not null default now()
);
create index work_order_comments_action_idx on public.work_order_comments (action_id, created_at);

-- Can this person see (and comment on) this work order right now?
create function private.can_see_work_order(p_action uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.actions a
    where a.id = p_action
      and a.kind = 'work_order'
      and (
        (select private.my_role()) in ('owner', 'manager')
        or ((select private.my_role()) = 'developer'
            and a.owner_staff_id is not null
            and a.owner_staff_id = (select private.my_staff_id())
            and a.status <> 'canceled')
      )
  )
$$;
revoke all on function private.can_see_work_order(uuid) from public, anon;
grant execute on function private.can_see_work_order(uuid) to authenticated;

revoke all on public.work_order_comments from public, anon, authenticated;
grant select, insert on public.work_order_comments to authenticated;
alter table public.work_order_comments enable row level security;
create policy work_order_comments_read on public.work_order_comments for select to authenticated
  using ((select private.can_see_work_order(action_id)));
create policy work_order_comments_add on public.work_order_comments for insert to authenticated
  with check (author = (select auth.uid()) and (select private.can_see_work_order(action_id)));
create policy work_order_comments_requires_2fa on public.work_order_comments as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2') with check ((select auth.jwt() ->> 'aal') = 'aal2');

-- ---------------------------------------------------------------------------
-- 3. History (written only by the trigger below)
-- ---------------------------------------------------------------------------
create table public.work_order_history (
  id        uuid primary key default gen_random_uuid(),
  action_id uuid not null references public.actions (id) on delete restrict,
  at        timestamptz not null default now(),
  actor     uuid references auth.users (id),
  field     text not null check (field in ('created', 'owner', 'status', 'due_on', 'start_on', 'priority', 'archived', 'reassign_request')),
  old_value text check (char_length(old_value) <= 200),
  new_value text check (char_length(new_value) <= 200)
);
create index work_order_history_action_idx on public.work_order_history (action_id, at);

revoke all on public.work_order_history from public, anon, authenticated;
grant select on public.work_order_history to authenticated;
alter table public.work_order_history enable row level security;
create policy work_order_history_read on public.work_order_history for select to authenticated
  using ((select private.can_see_work_order(action_id)));
create policy work_order_history_requires_2fa on public.work_order_history as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2') with check ((select auth.jwt() ->> 'aal') = 'aal2');

-- ---------------------------------------------------------------------------
-- 4. Notifications + mutes
-- ---------------------------------------------------------------------------
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id),
  kind       text not null check (kind in ('assigned', 'unassigned', 'due_changed', 'comment', 'reassign_request')),
  action_id  uuid references public.actions (id) on delete restrict,
  title      text not null check (char_length(title) between 1 and 200),
  actor      uuid references auth.users (id),
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

revoke all on public.notifications from public, anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
alter table public.notifications enable row level security;
create policy notifications_own_read on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy notifications_own_mark on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notifications_requires_2fa on public.notifications as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2') with check ((select auth.jwt() ->> 'aal') = 'aal2');

create table public.notification_settings (
  user_id uuid primary key default auth.uid() references auth.users (id),
  muted   text[] not null default '{}'
    check (muted <@ array['assigned', 'unassigned', 'due_changed', 'comment', 'reassign_request', 'due_tomorrow']::text[]),
  updated_at timestamptz not null default now()
);
revoke all on public.notification_settings from public, anon, authenticated;
grant select, insert on public.notification_settings to authenticated;
grant update (muted, updated_at) on public.notification_settings to authenticated;
alter table public.notification_settings enable row level security;
create policy notification_settings_own on public.notification_settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notification_settings_requires_2fa on public.notification_settings as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2') with check ((select auth.jwt() ->> 'aal') = 'aal2');

-- Send one notice to the login linked to a team member (if any), unless it's the person
-- who made the change or they muted that kind.
create function private.notify_staff(p_staff uuid, p_kind text, p_action uuid, p_title text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (user_id, kind, action_id, title, actor)
  select tm.user_id, p_kind, p_action, left(p_title, 200), auth.uid()
  from public.team_members tm
  where p_staff is not null
    and tm.staff_id = p_staff
    and tm.user_id is distinct from auth.uid()
    and not exists (select 1 from public.notification_settings ns where ns.user_id = tm.user_id and p_kind = any (ns.muted));
end;
$$;
revoke all on function private.notify_staff(uuid, text, uuid, text) from public, anon, authenticated;

create function private.notify_owners(p_kind text, p_action uuid, p_title text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (user_id, kind, action_id, title, actor)
  select tm.user_id, p_kind, p_action, left(p_title, 200), auth.uid()
  from public.team_members tm
  where tm.role = 'owner'
    and tm.user_id is distinct from auth.uid()
    and not exists (select 1 from public.notification_settings ns where ns.user_id = tm.user_id and p_kind = any (ns.muted));
end;
$$;
revoke all on function private.notify_owners(text, uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. The history + notice trigger (work orders only). Runs after the change is saved.
-- ---------------------------------------------------------------------------
create function private.work_order_track()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  t  text := left(new.title, 160);
begin
  if new.kind <> 'work_order' then
    return null;
  end if;
  if tg_op = 'INSERT' then
    insert into public.work_order_history (action_id, actor, field, new_value) values (new.id, me, 'created', new.status);
    if new.owner_staff_id is not null then
      insert into public.work_order_history (action_id, actor, field, new_value) values (new.id, me, 'owner', new.owner_staff_id::text);
      perform private.notify_staff(new.owner_staff_id, 'assigned', new.id, t);
    end if;
    return null;
  end if;

  if new.owner_staff_id is distinct from old.owner_staff_id then
    insert into public.work_order_history (action_id, actor, field, old_value, new_value) values (new.id, me, 'owner', old.owner_staff_id::text, new.owner_staff_id::text);
    perform private.notify_staff(new.owner_staff_id, 'assigned', new.id, t);
    perform private.notify_staff(old.owner_staff_id, 'unassigned', new.id, t);
  end if;
  if new.status is distinct from old.status then
    insert into public.work_order_history (action_id, actor, field, old_value, new_value) values (new.id, me, 'status', old.status, new.status);
  end if;
  if new.due_on is distinct from old.due_on then
    insert into public.work_order_history (action_id, actor, field, old_value, new_value) values (new.id, me, 'due_on', old.due_on::text, new.due_on::text);
    if new.owner_staff_id is not distinct from old.owner_staff_id then
      perform private.notify_staff(new.owner_staff_id, 'due_changed', new.id, t);
    end if;
  end if;
  if new.start_on is distinct from old.start_on then
    insert into public.work_order_history (action_id, actor, field, old_value, new_value) values (new.id, me, 'start_on', old.start_on::text, new.start_on::text);
  end if;
  if new.priority is distinct from old.priority then
    insert into public.work_order_history (action_id, actor, field, old_value, new_value) values (new.id, me, 'priority', old.priority, new.priority);
  end if;
  if (new.archived_at is null) is distinct from (old.archived_at is null) then
    insert into public.work_order_history (action_id, actor, field, new_value) values (new.id, me, 'archived', case when new.archived_at is null then 'restored' else 'archived' end);
  end if;
  if new.reassign_reason is distinct from old.reassign_reason then
    insert into public.work_order_history (action_id, actor, field, old_value, new_value) values (new.id, me, 'reassign_request', left(old.reassign_reason, 200), left(new.reassign_reason, 200));
    if new.reassign_reason is not null then
      perform private.notify_owners('reassign_request', new.id, t);
    end if;
  end if;
  return null;
end;
$$;
revoke all on function private.work_order_track() from public, anon, authenticated;
create trigger work_order_track after insert or update on public.actions
  for each row execute function private.work_order_track();

-- Comment notices: to the assignee (unless they wrote it); to the owner when a developer writes.
create function private.work_order_comment_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  a record;
begin
  select id, title, owner_staff_id into a from public.actions where id = new.action_id;
  perform private.notify_staff(a.owner_staff_id, 'comment', a.id, left(a.title, 160));
  if (select private.my_role()) = 'developer' then
    perform private.notify_owners('comment', a.id, left(a.title, 160));
  end if;
  return null;
end;
$$;
revoke all on function private.work_order_comment_notify() from public, anon, authenticated;
create trigger work_order_comment_notify after insert on public.work_order_comments
  for each row execute function private.work_order_comment_notify();

-- ---------------------------------------------------------------------------
-- 6. Developers' own list gains the new fields (same rows as before).
-- ---------------------------------------------------------------------------
create or replace view public.my_work as
  select a.id, a.kind, a.title, a.notes, a.priority, a.status, a.due_on, a.done_at, a.created_at,
         c.slug as client_slug, c.name as client_name,
         a.blocked_reason, a.promised_on,
         a.steps, a.source_link, a.source_note, a.est_minutes,
         a.submitted_at, a.sent_back_count, a.review_note,
         a.steps_done,
         a.start_on, a.actual_minutes, a.links, a.reassign_reason, a.reassign_requested_at
  from public.actions a
  left join public.clients c on c.id = a.client_id
  where (select auth.jwt() ->> 'aal') = 'aal2'
    and a.owner_staff_id is not null
    and a.owner_staff_id = (select private.my_staff_id())
    and a.status <> 'canceled'
    and (a.status <> 'done' or a.done_at > now() - interval '14 days');

commit;
