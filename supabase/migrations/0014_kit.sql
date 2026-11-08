-- Agency Atlas: Kit (the backpack tab): README, SOPs, FAQ, templates and the tools list.
--
-- Run ONCE in the Supabase SQL Editor (after 0001-0013).
--
-- What this adds (nothing existing changes):
-- * kit_docs          – README / SOP / FAQ / template pages. Plain text with simple
--                       formatting. Owner and managers write them; each page says who can
--                       read it (managers, developers). Archived instead of deleted.
-- * kit_doc_versions  – every saved version of every page, written by the database itself
--                       (nobody can add, change or remove history). Owner and managers read it.
-- * kit_tools         – the agency's tools and accounts: what it's for, where the login is
--                       kept (NEVER the password itself), who manages it, cost, renewal date.
--                       Owner and managers only.
-- * team_tools (view) – what developers see of the tools list: name, purpose, link and where
--                       the login is kept, only for tools marked for developers. No costs.
-- * One starter README (edit it freely).
--
-- Rules: two-factor required everywhere; no deletes; text that looks like a password or key
-- is refused by the database.

begin;

-- 1. Pages -----------------------------------------------------------------------
create table public.kit_docs (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('readme', 'sop', 'faq', 'template')),
  title       text not null check (char_length(title) between 1 and 120),
  category    text check (char_length(category) <= 40),
  body        text not null default '' check (char_length(body) <= 20000),
  -- Who besides the owner can read it.
  audience    text[] not null default '{manager,developer}'
                check (audience <@ array['manager', 'developer']::text[]),
  reviewed_on date,
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid() references auth.users (id),
  -- Never a password or key in a page (the app checks this too).
  constraint kit_docs_no_secrets check (
    body !~* '(password|passcode|passwd|pwd)\s*[:=]\s*\S'
    and body !~ 'sk-[A-Za-z0-9_-]{20,}'
    and title !~* '(password|passcode|passwd|pwd)\s*[:=]\s*\S'
  )
);
create index kit_docs_kind_idx on public.kit_docs (kind, archived);
create trigger kit_docs_touch before update on public.kit_docs
  for each row execute function private.touch_updated_at();

-- 2. Version history (written only by the database) -------------------------------
create table public.kit_doc_versions (
  id        uuid primary key default gen_random_uuid(),
  doc_id    uuid not null references public.kit_docs (id) on delete restrict,
  title     text not null,
  body      text not null,
  saved_at  timestamptz not null default now(),
  saved_by  uuid references auth.users (id)
);
create index kit_doc_versions_doc_idx on public.kit_doc_versions (doc_id, saved_at desc);

create function private.kit_doc_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.title is distinct from old.title or new.body is distinct from old.body then
    insert into public.kit_doc_versions (doc_id, title, body, saved_by)
    values (new.id, new.title, new.body, auth.uid());
  end if;
  return new;
end;
$$;
revoke execute on function private.kit_doc_version() from public, anon, authenticated;
create trigger kit_docs_version after insert or update on public.kit_docs
  for each row execute function private.kit_doc_version();

-- 3. Tools and accounts -------------------------------------------------------------
create table public.kit_tools (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (char_length(name) between 1 and 80),
  purpose        text check (char_length(purpose) <= 200),
  url            text check (url ~ '^https://[^\s<>"]+$' and char_length(url) <= 300),
  login_where    text check (char_length(login_where) <= 120),
  manager_staff_id uuid references public.staff (id) on delete restrict,
  access_note    text check (char_length(access_note) <= 200),
  monthly_usd    numeric(10, 2) check (monthly_usd >= 0 and monthly_usd < 100000),
  renews_on      date,
  for_developers boolean not null default false,
  archived       boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint kit_tools_no_secrets check (
    coalesce(login_where, '') || ' ' || coalesce(access_note, '') || ' ' || coalesce(purpose, '')
      !~* '(password|passcode|passwd|pwd)\s*[:=]\s*\S'
    and coalesce(login_where, '') || ' ' || coalesce(access_note, '') !~ 'sk-[A-Za-z0-9_-]{20,}'
  )
);
create trigger kit_tools_touch before update on public.kit_tools
  for each row execute function private.touch_updated_at();

-- 4. Permissions: start from nothing, then grant only what's needed (no deletes) ----
revoke all on public.kit_docs, public.kit_doc_versions, public.kit_tools from public, anon, authenticated;
grant select, insert on public.kit_docs to authenticated;
grant update (kind, title, category, body, audience, reviewed_on, archived) on public.kit_docs to authenticated;
grant select on public.kit_doc_versions to authenticated;
grant select, insert on public.kit_tools to authenticated;
grant update (name, purpose, url, login_where, manager_staff_id, access_note, monthly_usd, renews_on, for_developers, archived)
  on public.kit_tools to authenticated;

alter table public.kit_docs         enable row level security;
alter table public.kit_doc_versions enable row level security;
alter table public.kit_tools        enable row level security;

-- Pages: owner and managers read and write all; developers read live pages meant for them.
create policy kit_docs_read on public.kit_docs for select to authenticated
  using (
    (select private.my_role()) in ('owner', 'manager')
    or ((select private.my_role()) = 'developer' and 'developer' = any (audience) and not archived)
  );
create policy kit_docs_add on public.kit_docs for insert to authenticated
  with check ((select private.my_role()) in ('owner', 'manager') and updated_by = (select auth.uid()));
create policy kit_docs_edit on public.kit_docs for update to authenticated
  using ((select private.my_role()) in ('owner', 'manager'))
  with check ((select private.my_role()) in ('owner', 'manager'));

create policy kit_doc_versions_read on public.kit_doc_versions for select to authenticated
  using ((select private.my_role()) in ('owner', 'manager'));

create policy kit_tools_read on public.kit_tools for select to authenticated
  using ((select private.my_role()) in ('owner', 'manager'));
create policy kit_tools_add on public.kit_tools for insert to authenticated
  with check ((select private.my_role()) in ('owner', 'manager'));
create policy kit_tools_edit on public.kit_tools for update to authenticated
  using ((select private.my_role()) in ('owner', 'manager'))
  with check ((select private.my_role()) in ('owner', 'manager'));

-- Two-factor on every table, like everywhere else.
create policy kit_docs_requires_2fa on public.kit_docs as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2') with check ((select auth.jwt() ->> 'aal') = 'aal2');
create policy kit_doc_versions_requires_2fa on public.kit_doc_versions as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2') with check ((select auth.jwt() ->> 'aal') = 'aal2');
create policy kit_tools_requires_2fa on public.kit_tools as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2') with check ((select auth.jwt() ->> 'aal') = 'aal2');

-- 5. What developers see of the tools list (no cost, no access notes, no renewal) ---
-- Runs with the view owner's rights (like my_work), so its WHERE clause is the lock:
-- signed in with two-factor, on the team, and only tools marked for developers.
create view public.team_tools as
  select t.id, t.name, t.purpose, t.url, t.login_where
  from public.kit_tools t
  where (select auth.jwt() ->> 'aal') = 'aal2'
    and (select private.my_role()) in ('owner', 'manager', 'developer')
    and t.for_developers
    and not t.archived;
revoke all on public.team_tools from public, anon, authenticated;
grant select on public.team_tools to authenticated;

-- 6. Starter README (generic; edit it in the app) ------------------------------------
insert into public.kit_docs (kind, title, category, body, audience) values (
  'readme',
  'Start here: how work runs in Atlas',
  'Everyone',
  $readme$# Welcome
This is the team handbook. Read this page first, then the SOPs for your role.

## Your day
- Open **Work** first. Your work orders and issues are listed there, most urgent first.
- Overdue items have a red date. Do those first, or tell your manager why they're stuck.
- Mark an item **Blocked** and say what's blocking it, so your manager can help.

## Reading a work order
- **Title**: what needs to be done.
- **Steps**: do them in order. If a step doesn't make sense, ask before guessing.
- **Open conversation**: the GoHighLevel message it came from (opens in GoHighLevel).
- **Time**: about how long it should take. Tell your manager early if it will take much longer.
- **Promised to client**: a date we gave the client. Treat it as a hard deadline.

## Finishing work
- When it's done, press **Ready for review**. Your manager checks it and approves it, or sends it back with a note.
- Sent back? The note says what still needs fixing. Fix it and send it for review again.

## Rules
- Never put passwords or keys in Atlas, in work orders, or in messages. The tools list says where each login is kept.
- Client information stays inside the agency's tools.
- When unsure, ask. It's faster than redoing work.

## Where things are
- **Kit** (this tab): handbook, SOPs, FAQ, templates and tools.
- **Work**: your list.
- **Home**: what's due today.
$readme$,
  '{manager,developer}'
);

commit;
