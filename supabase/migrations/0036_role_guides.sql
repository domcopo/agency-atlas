-- Agency Atlas: role guides, personal goals and the ideas inbox (approved 2026-11-25,
-- docs/ROLE_GUIDES_PLAN.md, Phase G2). Numbered 0036 (next free after 0035 audit runs).
--
-- Run ONCE in the Supabase SQL Editor. Before running it, check that today's daily backup
-- exists (Supabase > Database > Backups). Undo steps are at the end.
-- Nothing existing is changed; the app works before this is run (starter guides only).
--
-- What this adds:
-- * role_guide_parts         – the owner/managers' edits to a role's guide: a replacement for
--                              one starter part (duties / goals / how_to) or an added section.
--                              Owner and managers read all; everyone else reads ONLY their own
--                              role's live rows. Managers can't edit the owner's guide.
-- * role_guide_part_versions – add-only history of every save (written only by the database).
-- * person_goals             – personal goals. Owner/managers set them; each person reads ONLY
--                              their own and may only tick them done (a trigger refuses any
--                              other change).
-- * ideas                    – feature ideas and requests. Anyone sends one, always as
--                              themselves, starting "new". You read your own; the owner reads
--                              all and is the only one who sets a status or replies.
--                              At most 10 a day per person.
-- No deletes for anyone. Two-factor (aal2) on every table. No passwords or keys in any text.

begin;

-- ---------------------------------------------------------------------------
-- 1. Guide edits + history
-- ---------------------------------------------------------------------------
create table public.role_guide_parts (
  id          uuid primary key default gen_random_uuid(),
  role        text not null check (role in ('owner', 'manager', 'developer', 'sales', 'va')),
  part        text not null check (part in ('duties', 'goals', 'how_to', 'extra')),
  title       text check (title is null or char_length(btrim(title)) between 1 and 80),
  body        text not null check (char_length(body) <= 8000),
  position    smallint not null default 0 check (position between 0 and 999),
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid() references auth.users (id),
  -- An added section has a title; a replaced starter part uses the starter's heading.
  constraint role_guide_parts_extra_title check ((part = 'extra') = (title is not null)),
  constraint role_guide_parts_no_secrets check (
    body !~* '(password|passcode|passwd|pwd)\s*[:=]\s*\S'
    and body !~ 'sk-[A-Za-z0-9_-]{20,}'
    and body !~ '-----BEGIN [A-Z ]*PRIVATE KEY-----'
    and coalesce(title, '') !~* '(password|passcode|passwd|pwd)\s*[:=]\s*\S'
  )
);
-- One live replacement per starter part per role (Reset archives it).
create unique index role_guide_parts_one_live on public.role_guide_parts (role, part)
  where part <> 'extra' and not archived;
create index role_guide_parts_role_idx on public.role_guide_parts (role, archived);

-- Who saved it is always the signed-in person, set by the database.
create function private.role_guide_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_by := auth.uid();
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.role := old.role;
    new.part := old.part;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;
revoke execute on function private.role_guide_stamp() from public, anon, authenticated;
create trigger role_guide_parts_stamp before insert or update on public.role_guide_parts
  for each row execute function private.role_guide_stamp();

create table public.role_guide_part_versions (
  id        uuid primary key default gen_random_uuid(),
  part_id   uuid not null references public.role_guide_parts (id) on delete restrict,
  title     text,
  body      text not null,
  archived  boolean not null,
  saved_at  timestamptz not null default now(),
  saved_by  uuid references auth.users (id)
);
create index role_guide_part_versions_idx on public.role_guide_part_versions (part_id, saved_at desc);

create function private.role_guide_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.title is distinct from old.title or new.body is distinct from old.body or new.archived is distinct from old.archived then
    insert into public.role_guide_part_versions (part_id, title, body, archived, saved_by)
    values (new.id, new.title, new.body, new.archived, auth.uid());
  end if;
  return new;
end;
$$;
revoke execute on function private.role_guide_version() from public, anon, authenticated;
create trigger role_guide_parts_version after insert or update on public.role_guide_parts
  for each row execute function private.role_guide_version();

revoke all on public.role_guide_parts, public.role_guide_part_versions from public, anon, authenticated;
grant select on public.role_guide_parts to authenticated;
grant insert (role, part, title, body, position) on public.role_guide_parts to authenticated;
grant update (title, body, position, archived) on public.role_guide_parts to authenticated;
grant select on public.role_guide_part_versions to authenticated;

alter table public.role_guide_parts         enable row level security;
alter table public.role_guide_part_versions enable row level security;

create policy role_guide_parts_read on public.role_guide_parts for select to authenticated
  using (
    (select private.my_role()) in ('owner', 'manager')
    or (role = (select private.my_role()) and not archived)
  );
create policy role_guide_parts_add on public.role_guide_parts for insert to authenticated
  with check (
    (select private.my_role()) = 'owner'
    or ((select private.my_role()) = 'manager' and role <> 'owner')
  );
create policy role_guide_parts_edit on public.role_guide_parts for update to authenticated
  using (
    (select private.my_role()) = 'owner'
    or ((select private.my_role()) = 'manager' and role <> 'owner')
  )
  with check (
    (select private.my_role()) = 'owner'
    or ((select private.my_role()) = 'manager' and role <> 'owner')
  );
create policy role_guide_part_versions_read on public.role_guide_part_versions for select to authenticated
  using ((select private.my_role()) in ('owner', 'manager'));

create policy role_guide_parts_requires_2fa on public.role_guide_parts as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2') with check ((select auth.jwt() ->> 'aal') = 'aal2');
create policy role_guide_part_versions_requires_2fa on public.role_guide_part_versions as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2') with check ((select auth.jwt() ->> 'aal') = 'aal2');

-- ---------------------------------------------------------------------------
-- 2. Personal goals
-- ---------------------------------------------------------------------------
create table public.person_goals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.team_members (user_id) on delete cascade,
  goal        text not null check (char_length(btrim(goal)) between 1 and 300),
  due_on      date,
  done_at     timestamptz,
  archived    boolean not null default false,
  created_by  uuid not null default auth.uid() references auth.users (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint person_goals_no_secrets check (
    goal !~* '(password|passcode|passwd|pwd)\s*[:=]\s*\S' and goal !~ 'sk-[A-Za-z0-9_-]{20,}'
  )
);
create index person_goals_user_idx on public.person_goals (user_id, archived);

-- Non-leads may only tick their own goal done (or undo it). The time is the database's.
create function private.person_goal_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select private.my_role()) not in ('owner', 'manager') then
    if new.goal is distinct from old.goal or new.due_on is distinct from old.due_on
       or new.archived is distinct from old.archived or new.user_id is distinct from old.user_id then
      raise exception 'Only the owner or a manager can change a goal' using errcode = '42501';
    end if;
  end if;
  new.user_id := old.user_id;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.updated_at := now();
  new.done_at := case when new.done_at is null then null else coalesce(old.done_at, now()) end;
  return new;
end;
$$;
revoke execute on function private.person_goal_guard() from public, anon, authenticated;
create trigger person_goals_guard before update on public.person_goals
  for each row execute function private.person_goal_guard();

revoke all on public.person_goals from public, anon, authenticated;
grant select on public.person_goals to authenticated;
grant insert (user_id, goal, due_on) on public.person_goals to authenticated;
grant update (goal, due_on, done_at, archived) on public.person_goals to authenticated;
alter table public.person_goals enable row level security;

create policy person_goals_read on public.person_goals for select to authenticated
  using ((select private.my_role()) in ('owner', 'manager') or user_id = (select auth.uid()));
create policy person_goals_add on public.person_goals for insert to authenticated
  with check ((select private.my_role()) in ('owner', 'manager') and created_by = (select auth.uid()));
create policy person_goals_edit on public.person_goals for update to authenticated
  using ((select private.my_role()) in ('owner', 'manager') or user_id = (select auth.uid()))
  with check ((select private.my_role()) in ('owner', 'manager') or user_id = (select auth.uid()));
create policy person_goals_requires_2fa on public.person_goals as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2') with check ((select auth.jwt() ->> 'aal') = 'aal2');

-- ---------------------------------------------------------------------------
-- 3. Ideas inbox
-- ---------------------------------------------------------------------------
create table public.ideas (
  id           uuid primary key default gen_random_uuid(),
  created_by   uuid not null default auth.uid() references public.team_members (user_id) on delete cascade,
  kind         text not null check (kind in ('feature', 'easier', 'broken')),
  title        text not null check (char_length(btrim(title)) between 1 and 120),
  details      text not null default '' check (char_length(details) <= 4000),
  status       text not null default 'new' check (status in ('new', 'reviewing', 'planned', 'done', 'not_now')),
  reply        text check (reply is null or char_length(reply) <= 500),
  created_at   timestamptz not null default now(),
  reviewed_at  timestamptz,
  reviewed_by  uuid references auth.users (id),
  constraint ideas_no_secrets check (
    title !~* '(password|passcode|passwd|pwd)\s*[:=]\s*\S'
    and details !~* '(password|passcode|passwd|pwd)\s*[:=]\s*\S'
    and details !~ 'sk-[A-Za-z0-9_-]{20,}'
    and details !~ '-----BEGIN [A-Z ]*PRIVATE KEY-----'
    and coalesce(reply, '') !~* '(password|passcode|passwd|pwd)\s*[:=]\s*\S'
  )
);
create index ideas_created_idx on public.ideas (created_at desc);
create index ideas_by_idx on public.ideas (created_by, created_at desc);

-- New ideas: always "new", no reply, at most 10 per person per day.
-- Reviews: the database records who reviewed and when; the idea itself never changes.
create function private.ideas_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
    new.status := 'new';
    new.reply := null;
    new.reviewed_at := null;
    new.reviewed_by := null;
    if (select count(*) from public.ideas i where i.created_by = auth.uid() and i.created_at > now() - interval '1 day') >= 10 then
      raise exception 'At most 10 ideas a day' using errcode = '23514';
    end if;
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.kind := old.kind;
    new.title := old.title;
    new.details := old.details;
    new.reviewed_at := now();
    new.reviewed_by := auth.uid();
  end if;
  return new;
end;
$$;
revoke execute on function private.ideas_guard() from public, anon, authenticated;
create trigger ideas_guard before insert or update on public.ideas
  for each row execute function private.ideas_guard();

revoke all on public.ideas from public, anon, authenticated;
grant select on public.ideas to authenticated;
grant insert (kind, title, details) on public.ideas to authenticated;
grant update (status, reply) on public.ideas to authenticated;
alter table public.ideas enable row level security;

create policy ideas_read on public.ideas for select to authenticated
  using ((select private.my_role()) = 'owner' or created_by = (select auth.uid()));
create policy ideas_add on public.ideas for insert to authenticated
  with check ((select private.my_role()) is not null and created_by = (select auth.uid()));
create policy ideas_review on public.ideas for update to authenticated
  using ((select private.my_role()) = 'owner')
  with check ((select private.my_role()) = 'owner');
create policy ideas_requires_2fa on public.ideas as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2') with check ((select auth.jwt() ->> 'aal') = 'aal2');

commit;

-- ---------------------------------------------------------------------------
-- UNDO (only if something is wrong; one block in the SQL Editor). This removes saved guide
-- edits, personal goals and ideas. The starter guides in the app are not affected.
--
-- begin;
-- drop table public.ideas;
-- drop function private.ideas_guard();
-- drop table public.person_goals;
-- drop function private.person_goal_guard();
-- drop table public.role_guide_part_versions;
-- drop table public.role_guide_parts;
-- drop function private.role_guide_version();
-- drop function private.role_guide_stamp();
-- commit;
-- ---------------------------------------------------------------------------
