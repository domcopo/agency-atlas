-- Break-in tests for the Agency Atlas security rules. LOCAL ONLY.
-- Every check either passes silently or stops the run with "FAILED: ...".
-- All data here is fictional.

-- ---------------------------------------------------------------------------
-- Test helpers (run as whatever role is active, so they test that role).
-- ---------------------------------------------------------------------------
create schema test;
grant usage on schema test to anon, authenticated;

-- Runs a statement and returns how many rows it touched/returned.
-- -1 = refused by permissions or a security rule; -2 = refused by a data check.
-- Any OTHER error (e.g. a typo in a test) stops the run, so it can't pass by accident.
create function test.rows(stmt text) returns bigint
language plpgsql as $$
declare n bigint;
begin
  if stmt ~* '^\s*select' then
    execute 'select count(*) from (' || stmt || ') q' into n;
  else
    execute stmt;
    get diagnostics n = row_count;
  end if;
  return n;
exception
  when insufficient_privilege then return -1;
  when check_violation then return -2;
end;
$$;

create function test.expect(stmt text, expected bigint, label text) returns void
language plpgsql as $$
declare got bigint := test.rows(stmt);
begin
  if got is distinct from expected then
    raise exception 'FAILED: % (expected %, got %; -1 = blocked, -2 = invalid data)', label, expected, got;
  end if;
  raise notice 'ok: %', label;
end;
$$;
grant execute on all functions in schema test to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Fictional people and data (inserted as the database admin).
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@example.com'),
  ('00000000-0000-0000-0000-0000000000a2', 'manager@example.com'),
  ('00000000-0000-0000-0000-0000000000a3', 'developer@example.com'),
  ('00000000-0000-0000-0000-0000000000a4', 'stranger@example.com');

insert into public.team_members (user_id, display_name, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'Owner (test)', 'owner'),
  ('00000000-0000-0000-0000-0000000000a2', 'Manager (test)', 'manager'),
  ('00000000-0000-0000-0000-0000000000a3', 'Developer (test)', 'developer');
-- a4 is signed in but NOT on the team.

insert into public.clients (id, slug, name, monthly_usd, start_date, status, services) values
  ('00000000-0000-0000-0000-0000000000c1', 'pat-example', 'Pat Example (fictional)', 300, '2026-01-05', 'active', '{SEO}');
insert into public.staff (name, role) values ('Dev A (test)', 'seo_developer');

-- ---------------------------------------------------------------------------
-- 1. Signed out (anon): nothing at all.
-- ---------------------------------------------------------------------------
begin;
set local role anon;
select test.expect('select * from public.clients', -1, 'signed out cannot read clients');
select test.expect('select * from public.team_members', -1, 'signed out cannot read the team');
select test.expect('select * from public.staff', -1, 'signed out cannot read staff');
select test.expect('select * from public.check_ins', -1, 'signed out cannot read check-ins');
select test.expect('select * from public.atlas_answers', -1, 'signed out cannot read answers');
select test.expect($$insert into public.clients (slug, name, monthly_usd, start_date, status) values ('x', 'X', 1, '2026-01-01', 'active')$$, -1, 'signed out cannot add clients');
select test.expect('select private.my_role()', -1, 'signed out cannot call the role helper');
commit;

-- ---------------------------------------------------------------------------
-- 2. Signed in but not on the team: sees nothing, changes nothing.
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a4"}';
select test.expect('select * from public.clients', 0, 'stranger sees no clients');
select test.expect('select * from public.team_members', 0, 'stranger sees no team');
select test.expect('select * from public.staff', 0, 'stranger sees no staff');
select test.expect($$update public.clients set monthly_usd = 1$$, 0, 'stranger cannot edit clients');
select test.expect($$insert into public.check_ins (client_id, happened_on) values ('00000000-0000-0000-0000-0000000000c1', '2026-11-01')$$, -1, 'stranger cannot log a check-in');
commit;

-- ---------------------------------------------------------------------------
-- 3. Developer: nothing in Phase 2.
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3"}';
select test.expect('select * from public.clients', 0, 'developer sees no client records');
select test.expect('select * from public.team_members', 1, 'developer sees only their own team row');
select test.expect($$insert into public.atlas_answers (question_key, status) values ('k', 'skipped')$$, -1, 'developer cannot answer Atlas asks');
commit;

-- ---------------------------------------------------------------------------
-- 4. Manager: reads clients, logs check-ins as themselves, cannot edit clients.
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2"}';
select test.expect('select * from public.clients', 1, 'manager reads clients');
select test.expect('select * from public.team_members', 1, 'manager sees only their own team row');
select test.expect($$update public.clients set monthly_usd = 1$$, 0, 'manager cannot edit client amounts');
select test.expect($$insert into public.clients (slug, name, monthly_usd, start_date, status) values ('x', 'X', 1, '2026-01-01', 'active')$$, -1, 'manager cannot add clients');
select test.expect($$insert into public.check_ins (client_id, happened_on) values ('00000000-0000-0000-0000-0000000000c1', '2026-11-01')$$, 1, 'manager logs a check-in');
select test.expect($$insert into public.check_ins (client_id, happened_on, logged_by) values ('00000000-0000-0000-0000-0000000000c1', '2026-11-01', '00000000-0000-0000-0000-0000000000a1')$$, -1, 'manager cannot log a check-in as someone else');
select test.expect($$delete from public.check_ins$$, -1, 'manager cannot delete check-ins');
select test.expect($$update public.team_members set role = 'owner'$$, -1, 'manager cannot promote themselves');
commit;

-- ---------------------------------------------------------------------------
-- 5. Owner: full read, edits clients, still cannot delete or rewrite history.
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1"}';
select test.expect('select * from public.team_members', 3, 'owner sees the whole team');
select test.expect($$update public.clients set services = '{SEO,Ads}' where slug = 'pat-example'$$, 1, 'owner edits a client');
select test.expect($$update public.clients set services = '{Hacking}' where slug = 'pat-example'$$, -2, 'unknown services are rejected');
select test.expect($$update public.clients set monthly_usd = -5 where slug = 'pat-example'$$, -2, 'negative amounts are rejected');
select test.expect($$insert into public.atlas_answers (question_key, status, answer) values ('svc:x', 'answered', 'SEO')$$, 1, 'owner answers Atlas asks');
select test.expect($$delete from public.clients$$, -1, 'even the owner cannot delete clients through the app');
select test.expect($$delete from public.atlas_answers$$, -1, 'answer history cannot be deleted');
select test.expect($$update public.check_ins set note = 'changed'$$, -1, 'check-in history cannot be rewritten');
select test.expect($$insert into public.team_members (user_id, display_name, role) values ('00000000-0000-0000-0000-0000000000a4', 'X', 'owner')$$, -1, 'nobody can add team members through the app');
commit;

-- ---------------------------------------------------------------------------
-- 6. Every table has RLS on, and anon has no table permissions at all.
-- ---------------------------------------------------------------------------
do $$
declare bad text;
begin
  select string_agg(c.relname, ', ') into bad
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if bad is not null then raise exception 'FAILED: RLS is off on: %', bad; end if;
  raise notice 'ok: RLS is on for every table';

  select string_agg(table_name || ':' || privilege_type, ', ') into bad
  from information_schema.role_table_grants
  where grantee = 'anon' and table_schema = 'public';
  if bad is not null then raise exception 'FAILED: signed-out role still has: %', bad; end if;
  raise notice 'ok: signed-out role has no table permissions';
end;
$$;

select 'ALL BREAK-IN TESTS PASSED' as result;
