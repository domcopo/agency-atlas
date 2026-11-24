-- Break-in tests for the Agency Atlas security rules. LOCAL ONLY.
-- Every check either passes silently or stops the run with "FAILED: ...".
-- All data here is fictional.

-- ---------------------------------------------------------------------------
-- Test helpers (run as whatever role is active, so they test that role).
-- ---------------------------------------------------------------------------
create schema test;
grant usage on schema test to anon, authenticated;

-- Runs a statement and returns how many rows it touched/returned.
-- -1 = refused by permissions or a security rule; -2 = refused by a data check;
-- -3 = refused as a duplicate (a unique rule).
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
  when unique_violation then return -3;
  when foreign_key_violation then return -2;
end;
$$;

create function test.expect(stmt text, expected bigint, label text) returns void
language plpgsql as $$
declare got bigint := test.rows(stmt);
begin
  if got is distinct from expected then
    raise exception 'FAILED: % (expected %, got %; -1 = blocked, -2 = invalid data, -3 = duplicate)', label, expected, got;
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
insert into public.ghl_opportunities (ghl_id, name, status, monetary_value) values
  ('opp1', 'Sample Roofing (fictional)', 'open', 500);
insert into public.ghl_appointments (ghl_id, calendar_name, status) values
  ('appt1', 'Discovery calls (sample)', 'confirmed');

-- ---------------------------------------------------------------------------
-- 1. Signed out (anon): nothing at all.
-- ---------------------------------------------------------------------------
begin;
set local role anon;
select test.expect('select id from public.clients', -1, 'signed out cannot read clients');
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
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a4","aal":"aal2"}';
select test.expect('select id from public.clients', 0, 'stranger sees no clients');
select test.expect('select * from public.team_members', 0, 'stranger sees no team');
select test.expect('select * from public.staff', 0, 'stranger sees no staff');
select test.expect($$update public.clients set services = '{Ads}'$$, 0, 'stranger cannot edit clients');
select test.expect($$insert into public.check_ins (client_id, happened_on) values ('00000000-0000-0000-0000-0000000000c1', '2026-11-01')$$, -1, 'stranger cannot log a check-in');
commit;

-- ---------------------------------------------------------------------------
-- 3. Developer: nothing in Phase 2.
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","aal":"aal2"}';
select test.expect('select id from public.clients', 0, 'developer sees no client records');
select test.expect('select * from public.team_members', 1, 'developer sees only their own team row');
select test.expect($$insert into public.atlas_answers (question_key, status) values ('k', 'skipped')$$, -1, 'developer cannot answer Atlas asks');
commit;

-- ---------------------------------------------------------------------------
-- 4. Manager: reads clients, logs check-ins as themselves, cannot edit clients.
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","aal":"aal2"}';
select test.expect('select id from public.clients', 1, 'manager reads clients');
select test.expect('select * from public.team_members', 1, 'manager sees only their own team row');
select test.expect($$update public.clients set services = '{Ads}'$$, -1, 'manager cannot edit clients (0019: refused outright)');
select test.expect($$select id from public.clients where services = '{Ads}'$$, 0, 'client services unchanged');
select test.expect($$update public.clients set monthly_usd = 1$$, -1, 'manager cannot edit client amounts (0025: the column is locked)');
select test.expect($$insert into public.clients (slug, name, monthly_usd, start_date, status) values ('x', 'X', 1, '2026-01-01', 'active')$$, -1, 'manager cannot add a client WITH an amount (0025: managers may add clients, never amounts; see 7u)');
select test.expect($$insert into public.check_ins (client_id, happened_on) values ('00000000-0000-0000-0000-0000000000c1', '2026-11-01')$$, 1, 'manager logs a check-in');
select test.expect($$insert into public.check_ins (client_id, happened_on, mood) values ('00000000-0000-0000-0000-0000000000c1', '2026-11-02', 'worse')$$, 1, 'manager logs a check-in with how they are doing');
select test.expect($$insert into public.check_ins (client_id, happened_on, mood) values ('00000000-0000-0000-0000-0000000000c1', '2026-11-02', 'furious')$$, -2, 'unknown moods are rejected');
-- 0021 (approved 2026-11-15) replaced "a mood cannot be changed afterwards": managers may now
-- fix a check-in, but every change is kept by the database (more in 7r).
select test.expect($$update public.check_ins set mood = 'better'$$, 2, 'a manager can fix a mood afterwards (0021)');
select test.expect($$select * from public.check_in_edits where change = 'edited' and new_mood = 'better' and actor = '00000000-0000-0000-0000-0000000000a2'$$, 2, 'and every mood change is kept in the change record');
select test.expect($$insert into public.check_ins (client_id, happened_on, logged_by) values ('00000000-0000-0000-0000-0000000000c1', '2026-11-01', '00000000-0000-0000-0000-0000000000a1')$$, -1, 'manager cannot log a check-in as someone else');
select test.expect($$delete from public.check_ins$$, -1, 'manager cannot delete check-ins');
select test.expect($$update public.team_members set role = 'owner'$$, -1, 'manager cannot promote themselves');
commit;

-- ---------------------------------------------------------------------------
-- 5. Owner: full read, edits clients, still cannot delete or rewrite history.
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","aal":"aal2"}';
select test.expect('select * from public.team_members', 3, 'owner sees the whole team');
select test.expect($$update public.clients set services = '{SEO,Ads}' where slug = 'pat-example'$$, 1, 'owner edits a client');
select test.expect($$update public.clients set services = '{Hacking}' where slug = 'pat-example'$$, -2, 'unknown services are rejected');
select test.expect($$insert into public.client_money (client_id, monthly_usd) values ('00000000-0000-0000-0000-0000000000c1', -5)$$, -2, 'negative amounts are rejected (0024: amounts live in client_money)');
select test.expect($$insert into public.atlas_answers (question_key, status, answer) values ('svc:x', 'answered', 'SEO')$$, 1, 'owner answers Atlas asks');
select test.expect($$delete from public.clients$$, 0, 'even the owner cannot delete clients that are not in Trash (nothing deleted)');
select test.expect($$delete from public.atlas_answers$$, -1, 'answer history cannot be deleted');
-- 0021 replaced "check-in history cannot be rewritten": a fix is allowed, the old text is kept.
select test.expect($$update public.check_ins set note = 'changed'$$, 2, 'owner can fix a check-in note (0021)');
select test.expect($$select * from public.check_in_edits where new_note = 'changed' and old_note is distinct from 'changed' and actor = '00000000-0000-0000-0000-0000000000a1'$$, 2, 'and the earlier note is kept in the change record');
select test.expect($$insert into public.team_members (user_id, display_name, role) values ('00000000-0000-0000-0000-0000000000a4', 'X', 'owner')$$, -1, 'nobody can add team members through the app');
commit;

-- ---------------------------------------------------------------------------
-- 6. Password only (no two-factor yet): even the owner gets nothing.
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","aal":"aal1"}';
select test.expect('select id from public.clients', 0, 'owner without two-factor sees no clients');
select test.expect('select * from public.team_members', 0, 'owner without two-factor sees no team');
select test.expect('select * from public.staff', 0, 'owner without two-factor sees no staff');
select test.expect('select * from public.check_ins', 0, 'owner without two-factor sees no check-ins');
select test.expect($$update public.clients set services = '{Ads}'$$, 0, 'owner without two-factor cannot edit clients');
select test.expect($$insert into public.check_ins (client_id, happened_on) values ('00000000-0000-0000-0000-0000000000c1', '2026-11-01')$$, -1, 'owner without two-factor cannot log a check-in');
select test.expect($$insert into public.atlas_answers (question_key, status) values ('k', 'skipped')$$, -1, 'owner without two-factor cannot answer Atlas asks');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2"}';
select test.expect('select id from public.clients', 0, 'manager with no two-factor level at all sees no clients');
commit;

-- ---------------------------------------------------------------------------
-- 7. GoHighLevel copies: owner syncs, managers read, nobody deletes.
-- ---------------------------------------------------------------------------
begin;
set local role anon;
select test.expect('select * from public.ghl_opportunities', -1, 'signed out cannot read GHL opportunities');
select test.expect('select * from public.ghl_appointments', -1, 'signed out cannot read GHL appointments');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a4","aal":"aal2"}';
select test.expect('select * from public.ghl_opportunities', 0, 'stranger sees no GHL opportunities');
select test.expect($$insert into public.ghl_syncs (opportunities, appointments) values (0, 0)$$, -1, 'stranger cannot record a sync');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","aal":"aal2"}';
select test.expect('select * from public.ghl_opportunities', 0, 'developer sees no GHL opportunities');
select test.expect('select * from public.ghl_appointments', 0, 'developer sees no GHL appointments');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","aal":"aal2"}';
select test.expect('select * from public.ghl_opportunities', 1, 'manager reads GHL opportunities');
select test.expect('select * from public.ghl_appointments', 1, 'manager reads GHL appointments');
select test.expect($$update public.ghl_opportunities set monetary_value = 1$$, 0, 'manager cannot change GHL copies');
select test.expect($$insert into public.ghl_opportunities (ghl_id, status) values ('opp2', 'open')$$, -1, 'manager cannot add GHL copies');
select test.expect($$insert into public.ghl_syncs (opportunities, appointments) values (0, 0)$$, -1, 'manager cannot record a sync');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","aal":"aal2"}';
select test.expect($$insert into public.ghl_opportunities (ghl_id, status) values ('opp2', 'won') on conflict (ghl_id) do update set status = excluded.status$$, 1, 'owner sync adds an opportunity');
select test.expect($$update public.ghl_opportunities set stage_name = 'Proposal' where ghl_id = 'opp1'$$, 1, 'owner sync updates an opportunity');
select test.expect($$update public.ghl_opportunities set status = 'deleted' where ghl_id = 'opp1'$$, -2, 'unknown opportunity status is rejected');
select test.expect($$insert into public.ghl_opportunities (ghl_id, status) values ('bad id; drop', 'open')$$, -2, 'odd GHL ids are rejected');
select test.expect($$insert into public.ghl_syncs (opportunities, appointments) values (2, 1)$$, 1, 'owner records a sync');
select test.expect($$insert into public.ghl_syncs (opportunities, appointments, ran_by) values (2, 1, '00000000-0000-0000-0000-0000000000a2')$$, -1, 'owner cannot record a sync as someone else');
select test.expect($$delete from public.ghl_opportunities$$, -1, 'GHL copies cannot be deleted');
select test.expect($$update public.ghl_syncs set opportunities = 0$$, -1, 'sync history cannot be rewritten');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","aal":"aal1"}';
select test.expect('select * from public.ghl_opportunities', 0, 'owner without two-factor sees no GHL opportunities');
select test.expect($$insert into public.ghl_syncs (opportunities, appointments) values (0, 0)$$, -1, 'owner without two-factor cannot record a sync');
commit;

-- ---------------------------------------------------------------------------
-- 7b. AI: usage log can't be edited, budget is owner-only, results are history.
-- ---------------------------------------------------------------------------
begin;
set local role anon;
select test.expect('select * from public.ai_usage', -1, 'signed out cannot read AI usage');
select test.expect('select * from public.ai_client_profiles', -1, 'signed out cannot read AI profiles');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","aal":"aal2"}';
select test.expect('select * from public.ai_settings', 0, 'developer cannot see the AI budget');
select test.expect($$insert into public.ai_usage (feature, model, input_tokens, output_tokens, cost_usd, outcome) values ('briefing', 'm', 1, 1, 0.01, 'ok')$$, -1, 'developer cannot use the AI');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","aal":"aal2"}';
select test.expect($$insert into public.ai_usage (feature, model, input_tokens, output_tokens, cost_usd, outcome) values ('briefing', 'claude-opus-5-5', 1000, 500, 0.014, 'ok')$$, 1, 'manager AI request is logged');
select test.expect($$insert into public.ai_usage (feature, model, input_tokens, output_tokens, cost_usd, outcome, requested_by) values ('briefing', 'm', 1, 1, 0.01, 'ok', '00000000-0000-0000-0000-0000000000a1')$$, -1, 'usage cannot be logged as someone else');
select test.expect($$update public.ai_usage set cost_usd = 0$$, -1, 'the usage log cannot be edited');
select test.expect($$delete from public.ai_usage$$, -1, 'the usage log cannot be deleted');
select test.expect($$update public.ai_settings set monthly_budget_usd = 500$$, 0, 'manager cannot raise the budget');
select test.expect('select * from public.ai_settings', 1, 'manager can see the budget');
select test.expect($$insert into public.ai_client_profiles (client_id, content) values ('00000000-0000-0000-0000-0000000000c1', '{"summary":"x"}')$$, 1, 'manager saves an AI profile draft');
select test.expect($$update public.ai_client_profiles set reviewed_at = now()$$, 0, 'manager cannot mark profiles reviewed');
select test.expect($$insert into public.ai_briefings (kind, content) values ('daily', '{"headline":"x"}')$$, 1, 'manager saves a briefing');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","aal":"aal2"}';
select test.expect($$update public.ai_settings set monthly_budget_usd = 15, updated_at = now()$$, 1, 'owner changes the budget');
select test.expect($$update public.ai_settings set monthly_budget_usd = 100000$$, -2, 'absurd budgets are rejected');
select test.expect($$update public.ai_settings set id = 2$$, -1, 'the budget row cannot be swapped');
select test.expect($$update public.ai_client_profiles set reviewed_at = now()$$, 1, 'owner marks a profile reviewed');
select test.expect($$update public.ai_client_profiles set content = '{"summary":"changed"}'$$, -1, 'AI profile text cannot be rewritten');
select test.expect($$delete from public.ai_briefings$$, -1, 'briefings cannot be deleted');
select test.expect($$insert into public.ai_usage (feature, model, input_tokens, output_tokens, cost_usd, outcome) values ('briefing', 'm', 1, 1, -1, 'ok')$$, -2, 'negative costs are rejected');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","aal":"aal1"}';
select test.expect('select * from public.ai_usage', 0, 'owner without two-factor sees no AI usage');
commit;

-- ---------------------------------------------------------------------------
-- 7c. Owners, next actions and activity: owner and managers work them; nobody
--     deletes; an action can't be moved to another client; history can't change.
-- ---------------------------------------------------------------------------
insert into public.staff (id, name, role) values ('00000000-0000-0000-0000-0000000000b2', 'Lead (test)', 'client_comms');

begin;
set local role anon;
select test.expect('select * from public.actions', -1, 'signed out cannot read actions');
select test.expect('select * from public.activity', -1, 'signed out cannot read activity');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a4","aal":"aal2"}';
select test.expect($$insert into public.actions (client_id, title) values ('00000000-0000-0000-0000-0000000000c1', 'x')$$, -1, 'non-team user cannot add actions');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","aal":"aal2"}';
select test.expect('select * from public.actions', 0, 'developer sees no actions yet');
select test.expect($$insert into public.actions (client_id, title) values ('00000000-0000-0000-0000-0000000000c1', 'x')$$, -1, 'developer cannot add actions yet');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","aal":"aal2"}';
select test.expect($$insert into public.actions (id, client_id, title, owner_staff_id, due_on) values ('00000000-0000-0000-0000-00000000ac01', '00000000-0000-0000-0000-0000000000c1', 'Review ad results', '00000000-0000-0000-0000-0000000000b2', '2026-11-10')$$, 1, 'manager adds a next action');
select test.expect($$insert into public.actions (lead_ghl_id, title) values ('opp1abc', 'Call back')$$, 1, 'manager adds a lead action');
select test.expect($$insert into public.actions (title) values ('No client')$$, -2, 'an action needs a client or a lead');
select test.expect($$insert into public.actions (client_id, lead_ghl_id, title) values ('00000000-0000-0000-0000-0000000000c1', 'opp1abc', 'Both')$$, -2, 'an action cannot have both a client and a lead');
select test.expect($$insert into public.actions (client_id, title, priority) values ('00000000-0000-0000-0000-0000000000c1', 'x', 'urgent!!')$$, -2, 'unknown priorities are rejected');
select test.expect($$insert into public.actions (client_id, title, created_by) values ('00000000-0000-0000-0000-0000000000c1', 'x', '00000000-0000-0000-0000-0000000000a1')$$, -1, 'actions cannot be added as someone else');
select test.expect($$update public.actions set status = 'done', done_at = now() where id = '00000000-0000-0000-0000-00000000ac01'$$, 1, 'manager marks an action done');
select test.expect($$update public.actions set client_id = null where id = '00000000-0000-0000-0000-00000000ac01'$$, -1, 'an action cannot be moved off its client');
select test.expect($$update public.actions set created_by = '00000000-0000-0000-0000-0000000000a1'$$, -1, 'an action creator cannot be rewritten');
select test.expect($$delete from public.actions$$, 0, 'actions cannot be deleted (nothing deleted)');
select test.expect($$update public.clients set owner_staff_id = '00000000-0000-0000-0000-0000000000b2'$$, -1, 'manager cannot set client owners (0019: refused outright)');
select test.expect($$select id from public.clients where owner_staff_id = '00000000-0000-0000-0000-0000000000b2'$$, 0, 'client owner unchanged');
select test.expect($$insert into public.activity (client_id, kind, summary) values ('00000000-0000-0000-0000-0000000000c1', 'action_done', 'Done: Review ad results')$$, 1, 'manager logs activity');
select test.expect($$insert into public.activity (client_id, kind, summary, actor) values ('00000000-0000-0000-0000-0000000000c1', 'action_done', 'x', '00000000-0000-0000-0000-0000000000a1')$$, -1, 'activity cannot be logged as someone else');
select test.expect($$update public.activity set summary = 'changed'$$, -1, 'activity history cannot be edited');
select test.expect($$delete from public.activity$$, -1, 'activity history cannot be deleted');
select test.expect($$insert into public.check_ins (client_id, happened_on, kind) values ('00000000-0000-0000-0000-0000000000c1', '2026-11-03', 'call')$$, 1, 'manager logs a call');
select test.expect($$insert into public.check_ins (client_id, happened_on, kind) values ('00000000-0000-0000-0000-0000000000c1', '2026-11-03', 'carrier pigeon')$$, -2, 'unknown contact kinds are rejected');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","aal":"aal2"}';
select test.expect($$update public.clients set owner_staff_id = '00000000-0000-0000-0000-0000000000b2'$$, 1, 'owner sets a client owner');
select test.expect('select * from public.actions', 2, 'owner sees all actions');
select test.expect($$delete from public.actions$$, 0, 'even the owner cannot delete actions that are not in Trash (nothing deleted)');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","aal":"aal1"}';
select test.expect('select * from public.actions', 0, 'owner without two-factor sees no actions');
select test.expect('select * from public.activity', 0, 'owner without two-factor sees no activity');
commit;

-- ---------------------------------------------------------------------------
-- 7d. Developer view (0007): own items only, status only, no client details.
-- ---------------------------------------------------------------------------
insert into public.staff (id, name, role) values ('00000000-0000-0000-0000-0000000000b3', 'Dev B (test)', 'seo_developer');
update public.team_members set staff_id = '00000000-0000-0000-0000-0000000000b3' where user_id = '00000000-0000-0000-0000-0000000000a3';
insert into public.actions (id, client_id, kind, title, owner_staff_id, priority, due_on, created_by) values
  ('00000000-0000-0000-0000-00000000ad01', '00000000-0000-0000-0000-0000000000c1', 'issue', 'Fix tracking (test)', '00000000-0000-0000-0000-0000000000b3', 'high', '2026-11-05', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-00000000ad02', '00000000-0000-0000-0000-0000000000c1', 'follow_up', 'Someone else''s (test)', '00000000-0000-0000-0000-0000000000b2', 'normal', '2026-11-05', '00000000-0000-0000-0000-0000000000a1');

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","aal":"aal2"}';
select test.expect('select * from public.actions', 1, 'developer sees only their own item');
select test.expect('select * from public.my_work', 1, 'my_work lists only their own item');
select test.expect($$select * from public.my_work where client_name = 'Pat Example (fictional)'$$, 1, 'my_work includes the client name');
select test.expect('select id from public.clients', 0, 'developer still cannot read clients (no revenue)');
select test.expect('select * from public.check_ins', 0, 'developer cannot read check-ins');
select test.expect('select * from public.ghl_opportunities', 0, 'developer cannot read the sales pipeline');
select test.expect('select * from public.ai_briefings', 0, 'developer cannot read AI briefings');
select test.expect('select * from public.activity', 0, 'developer cannot read history');
select test.expect($$update public.actions set status = 'in_progress' where id = '00000000-0000-0000-0000-00000000ad01'$$, 1, 'developer updates the status of their own item');
-- (Since 0011, issues and work orders need a manager's review before done; see 7h.)
select test.expect($$update public.actions set status = 'done', done_at = now() where id = '00000000-0000-0000-0000-00000000ad01'$$, -1, 'developer cannot mark their own issue done (needs review)');
select test.expect($$update public.actions set title = 'changed' where id = '00000000-0000-0000-0000-00000000ad01'$$, -1, 'developer cannot rename their item');
select test.expect($$update public.actions set due_on = '2027-01-01' where id = '00000000-0000-0000-0000-00000000ad01'$$, -1, 'developer cannot move their due date');
select test.expect($$update public.actions set owner_staff_id = '00000000-0000-0000-0000-0000000000b2' where id = '00000000-0000-0000-0000-00000000ad01'$$, -1, 'developer cannot hand their item to someone else');
select test.expect($$update public.actions set status = 'done' where id = '00000000-0000-0000-0000-00000000ad02'$$, 0, 'developer cannot touch someone else''s item');
select test.expect($$delete from public.actions$$, 0, 'developer cannot delete items (nothing deleted)');
select test.expect($$insert into public.actions (client_id, title) values ('00000000-0000-0000-0000-0000000000c1', 'x')$$, -1, 'developer cannot add items');
select test.expect($$insert into public.activity (client_id, action_id, kind, summary) values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000ad01', 'action_done', 'Done: Fix tracking (test)')$$, 1, 'developer logs history for their own item');
select test.expect($$insert into public.activity (client_id, action_id, kind, summary) values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000ad02', 'action_done', 'x')$$, -1, 'developer cannot log history for someone else''s item');
select test.expect($$insert into public.activity (client_id, kind, summary) values ('00000000-0000-0000-0000-0000000000c1', 'owner_changed', 'x')$$, -1, 'developer cannot log unrelated history');
select test.expect($$update public.team_members set staff_id = '00000000-0000-0000-0000-0000000000b2'$$, -1, 'developer cannot re-link their login to someone else');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","aal":"aal1"}';
select test.expect('select * from public.my_work', 0, 'developer without two-factor gets nothing from my_work');
select test.expect('select * from public.actions', 0, 'developer without two-factor sees no items');
commit;

begin;
set local role anon;
select test.expect('select * from public.my_work', -1, 'signed out cannot read my_work');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a4","aal":"aal2"}';
select test.expect('select * from public.my_work', 0, 'non-team user gets nothing from my_work');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","aal":"aal2"}';
select test.expect($$update public.actions set title = 'Manager renames (test)' where id = '00000000-0000-0000-0000-00000000ad02'$$, 1, 'managers can still edit items fully');
commit;

-- ---------------------------------------------------------------------------
-- 7e. GoHighLevel contact times (0008): owner syncs and confirms; managers read.
-- ---------------------------------------------------------------------------
begin;
set local role anon;
select test.expect('select * from public.ghl_contact_links', -1, 'signed out cannot read contact links');
select test.expect('select * from public.ghl_contact_stats', -1, 'signed out cannot read contact times');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","aal":"aal2"}';
select test.expect($$insert into public.ghl_contact_links (client_id, ghl_contact_id, contact_name) values ('00000000-0000-0000-0000-0000000000c1', 'cont12345', 'Sample Contact (fictional)')$$, 1, 'owner saves a suggested match');
select test.expect($$insert into public.ghl_contact_links (client_id, ghl_contact_id) values ('00000000-0000-0000-0000-0000000000c1', 'cont67890')$$, 1, 'owner saves a second suggestion');
select test.expect($$update public.ghl_contact_links set status = 'confirmed', updated_at = now() where ghl_contact_id = 'cont12345'$$, 1, 'owner confirms a match');
select test.expect($$insert into public.ghl_contact_links (client_id, ghl_contact_id, status) values ('00000000-0000-0000-0000-0000000000c1', 'cont00001', 'not-a-status')$$, -2, 'unknown match statuses are rejected');
select test.expect($$insert into public.ghl_contact_links (client_id, ghl_contact_id) values ('00000000-0000-0000-0000-0000000000c1', 'bad id; drop')$$, -2, 'odd contact ids are rejected');
select test.expect($$insert into public.ghl_contact_stats (client_id, ghl_contact_id, last_inbound_at, last_channel, unanswered_outbound) values ('00000000-0000-0000-0000-0000000000c1', 'cont12345', now(), 'text', 2)$$, 1, 'owner saves contact times');
select test.expect($$insert into public.ghl_contact_stats (client_id, ghl_contact_id, last_channel) values ('00000000-0000-0000-0000-0000000000c1', 'cont12345', 'carrier pigeon')$$, -2, 'unknown channels are rejected');
select test.expect($$insert into public.ghl_contact_stats (client_id, ghl_contact_id, unanswered_outbound) values ('00000000-0000-0000-0000-0000000000c1', 'cont12345', 3) on conflict (client_id) do update set client_id = excluded.client_id, ghl_contact_id = excluded.ghl_contact_id, unanswered_outbound = excluded.unanswered_outbound$$, 1, 'owner sync refreshes contact times (save or update)');
select test.expect($$insert into public.ghl_contact_links (client_id, ghl_contact_id) values ('00000000-0000-0000-0000-0000000000c1', 'cont12345') on conflict do nothing$$, 0, 'adding an existing match again changes nothing');
select test.expect($$update public.ghl_contact_links set client_id = gen_random_uuid()$$, -1, 'a match cannot be moved to another client');
select test.expect($$delete from public.ghl_contact_links$$, -1, 'matches cannot be deleted');
select test.expect($$delete from public.ghl_contact_stats$$, -1, 'contact times cannot be deleted');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","aal":"aal2"}';
select test.expect($$update public.ghl_contact_links set status = 'confirmed' where ghl_contact_id = 'cont67890'$$, -3, 'only one confirmed match per client');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","aal":"aal2"}';
select test.expect('select * from public.ghl_contact_stats', 1, 'manager reads contact times');
select test.expect('select * from public.ghl_contact_links', 2, 'manager reads matches');
select test.expect($$update public.ghl_contact_links set status = 'rejected'$$, 0, 'manager cannot change matches');
select test.expect($$insert into public.ghl_contact_links (client_id, ghl_contact_id) values ('00000000-0000-0000-0000-0000000000c1', 'cont55555')$$, -1, 'manager cannot add matches');
select test.expect($$update public.ghl_contact_stats set unanswered_outbound = 0$$, 0, 'manager cannot edit contact times');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","aal":"aal2"}';
select test.expect('select * from public.ghl_contact_stats', 0, 'developer cannot read contact times');
select test.expect('select * from public.ghl_contact_links', 0, 'developer cannot read matches');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","aal":"aal1"}';
select test.expect('select * from public.ghl_contact_stats', 0, 'owner without two-factor sees no contact times');
commit;

-- ---------------------------------------------------------------------------
-- 7f. Promises, blockers and health history (0009).
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","aal":"aal2"}';
select test.expect($$update public.actions set promised_on = current_date + 3 where id = '00000000-0000-0000-0000-00000000ad01'$$, 1, 'manager sets a promise date');
select test.expect($$update public.actions set status = 'blocked', blocked_reason = 'Waiting on logins (test)' where id = '00000000-0000-0000-0000-00000000ad02'$$, 1, 'manager marks an item blocked with a reason');
select test.expect($$update public.actions set status = 'stuck' where id = '00000000-0000-0000-0000-00000000ad02'$$, -2, 'unknown statuses are still rejected');
select test.expect($$update public.actions set blocked_reason = repeat('x', 201) where id = '00000000-0000-0000-0000-00000000ad02'$$, -2, 'blocked reason is length-limited');
select test.expect($$insert into public.client_health_daily (client_id, day, score, level) values ('00000000-0000-0000-0000-0000000000c1', current_date, 70, 'watch')$$, 1, 'manager saves today''s score');
select test.expect($$insert into public.client_health_daily (client_id, day, score, level) values ('00000000-0000-0000-0000-0000000000c1', current_date, 90, 'healthy') on conflict do nothing$$, 0, 'a second score the same day changes nothing');
select test.expect($$insert into public.client_health_daily (client_id, day, score, level) values ('00000000-0000-0000-0000-0000000000c1', current_date - 30, 95, 'healthy')$$, -1, 'old history cannot be backfilled');
select test.expect($$insert into public.client_health_daily (client_id, day, score, level, recorded_by) values ('00000000-0000-0000-0000-0000000000c1', current_date + 1, 50, 'watch', '00000000-0000-0000-0000-0000000000a1')$$, -1, 'cannot save a score as someone else');
select test.expect($$insert into public.client_health_daily (client_id, day, score, level) values ('00000000-0000-0000-0000-0000000000c1', current_date + 1, 150, 'watch')$$, -2, 'scores above 100 are rejected');
select test.expect($$update public.client_health_daily set score = 100$$, -1, 'score history cannot be edited');
select test.expect($$delete from public.client_health_daily$$, -1, 'score history cannot be deleted');
select test.expect('select * from public.client_health_daily', 1, 'manager reads score history');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","aal":"aal2"}';
select test.expect($$update public.actions set status = 'blocked', blocked_reason = 'Need access (test)' where id = '00000000-0000-0000-0000-00000000ad01'$$, 1, 'developer marks their own item blocked with a reason');
select test.expect($$update public.actions set promised_on = current_date + 30 where id = '00000000-0000-0000-0000-00000000ad01'$$, -1, 'developer cannot move the promise date');
select test.expect($$select * from public.my_work where status = 'blocked' and blocked_reason is not null and promised_on is not null$$, 1, 'my_work shows blocked reason and promise date');
select test.expect('select * from public.client_health_daily', 0, 'developer cannot read score history');
select test.expect($$insert into public.client_health_daily (client_id, day, score, level) values ('00000000-0000-0000-0000-0000000000c1', current_date - 1, 10, 'at_risk')$$, -1, 'developer cannot save scores');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","aal":"aal1"}';
select test.expect('select * from public.client_health_daily', 0, 'owner without two-factor sees no score history');
commit;

begin;
set local role anon;
select test.expect('select * from public.client_health_daily', -1, 'signed out cannot read score history');
commit;

-- ---------------------------------------------------------------------------
-- 7g. Work orders, AI drafts and the developer contact view (0010).
-- ---------------------------------------------------------------------------
-- A second client the developer has no work on (must never show up for them).
insert into public.clients (id, slug, name, monthly_usd, start_date, status, services) values
  ('00000000-0000-0000-0000-0000000000c2', 'sam-sample', 'Sam Sample (fictional)', 900, '2026-02-01', 'active', '{Ads}');
insert into public.ghl_contact_stats (client_id, ghl_contact_id, last_inbound_at) values
  ('00000000-0000-0000-0000-0000000000c2', 'cont22222', now());

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","aal":"aal2"}';
select test.expect($$insert into public.actions (id, client_id, kind, title, owner_staff_id, steps, source_link, source_note, est_minutes, ai_suggested) values ('00000000-0000-0000-0000-00000000ae01', '00000000-0000-0000-0000-0000000000c1', 'work_order', 'Fix contact form (test)', '00000000-0000-0000-0000-0000000000b3', E'Check form\nTest submit', 'https://app.example.com/conversations/abc123', 'Client asked by text (test)', 60, true)$$, 1, 'manager adds a work order with steps and a link');
select test.expect($$insert into public.actions (client_id, kind, title) values ('00000000-0000-0000-0000-0000000000c1', 'chore', 'x')$$, -2, 'unknown item kinds are rejected');
select test.expect($$insert into public.actions (client_id, kind, title, source_link) values ('00000000-0000-0000-0000-0000000000c1', 'work_order', 'x', 'javascript:alert(1)')$$, -2, 'non-web links are rejected');
select test.expect($$insert into public.actions (client_id, kind, title, source_link) values ('00000000-0000-0000-0000-0000000000c1', 'work_order', 'x', 'http://example.com')$$, -2, 'plain http links are rejected');
select test.expect($$insert into public.actions (client_id, kind, title, est_minutes) values ('00000000-0000-0000-0000-0000000000c1', 'work_order', 'x', 0)$$, -2, 'time estimates must be sensible');
select test.expect($$insert into public.actions (client_id, kind, title, steps) values ('00000000-0000-0000-0000-0000000000c1', 'work_order', 'x', repeat('x', 2001))$$, -2, 'step lists are length-limited');
select test.expect($$update public.actions set steps = E'Check form\nTest submit\nTell client' where id = '00000000-0000-0000-0000-00000000ae01'$$, 1, 'manager edits the steps');
select test.expect($$update public.actions set ai_suggested = false where id = '00000000-0000-0000-0000-00000000ae01'$$, -1, 'the AI-draft mark cannot be changed');
select test.expect($$update public.actions set kind = 'issue' where id = '00000000-0000-0000-0000-00000000ae01'$$, -1, 'an item''s kind cannot be changed');
select test.expect($$insert into public.ai_usage (feature, model, input_tokens, output_tokens, cost_usd, outcome) values ('work_orders', 'm', 1, 1, 0.01, 'ok')$$, 1, 'work order drafts are cost-logged');
select test.expect($$insert into public.ai_usage (feature, model, input_tokens, output_tokens, cost_usd, outcome) values ('work_prompt', 'm', 1, 1, 0.01, 'ok')$$, 1, 'the prompt helper is cost-logged');
select test.expect($$insert into public.ai_usage (feature, model, input_tokens, output_tokens, cost_usd, outcome) values ('send_emails', 'm', 1, 1, 0.01, 'ok')$$, -2, 'unknown AI features are rejected');
select test.expect($$insert into public.ai_briefings (kind, content) values ('work_orders', '{"orders":[]}')$$, 1, 'manager saves work order drafts');
select test.expect($$insert into public.ai_briefings (kind, content) values ('anything', '{}')$$, -2, 'unknown saved AI kinds are rejected');
select test.expect('select * from public.my_client_contacts', 0, 'managers get nothing from the developer contact view');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","aal":"aal2"}';
select test.expect($$select * from public.my_work where kind = 'work_order' and steps is not null and source_link is not null and est_minutes = 60$$, 1, 'my_work shows the developer their work order details');
select test.expect($$update public.actions set status = 'in_progress' where id = '00000000-0000-0000-0000-00000000ae01'$$, 1, 'developer starts their work order');
select test.expect($$update public.actions set steps = 'skip it' where id = '00000000-0000-0000-0000-00000000ae01'$$, -1, 'developer cannot change the steps');
select test.expect($$update public.actions set source_link = 'https://example.com/other' where id = '00000000-0000-0000-0000-00000000ae01'$$, -1, 'developer cannot change the link');
select test.expect($$update public.actions set source_note = 'x' where id = '00000000-0000-0000-0000-00000000ae01'$$, -1, 'developer cannot change the note');
select test.expect($$update public.actions set est_minutes = 5 where id = '00000000-0000-0000-0000-00000000ae01'$$, -1, 'developer cannot change the time estimate');
select test.expect($$insert into public.actions (client_id, kind, title) values ('00000000-0000-0000-0000-0000000000c1', 'work_order', 'x')$$, -1, 'developer cannot add work orders');
select test.expect('select * from public.my_client_contacts', 1, 'developer sees contact dates only for clients they work on');
select test.expect($$select * from public.my_client_contacts where client_slug = 'sam-sample'$$, 0, 'developer cannot see other clients'' contact dates');
select test.expect($$select * from public.my_client_contacts where last_inbound_at is not null and last_logged_on is not null$$, 1, 'the view includes logged and GoHighLevel dates');
select test.expect('select * from public.ghl_contact_stats', 0, 'developer still cannot read the contact table itself');
select test.expect('select * from public.check_ins', 0, 'developer still cannot read check-in notes');
select test.expect($$select * from public.ai_briefings where kind = 'work_orders'$$, 0, 'developer cannot read AI work order drafts');
select test.expect($$insert into public.ai_usage (feature, model, input_tokens, output_tokens, cost_usd, outcome) values ('work_prompt', 'm', 1, 1, 0.01, 'ok')$$, -1, 'developer cannot use the AI prompt helper');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","aal":"aal1"}';
select test.expect('select * from public.my_client_contacts', 0, 'developer without two-factor gets no contact dates');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a4","aal":"aal2"}';
select test.expect('select * from public.my_client_contacts', 0, 'non-team user gets no contact dates');
commit;

begin;
set local role anon;
select test.expect('select * from public.my_client_contacts', -1, 'signed out cannot read contact dates');
commit;

-- The contact view must only ever expose names and dates.
do $$
declare cols text;
begin
  select string_agg(column_name, ',' order by column_name) into cols
  from information_schema.columns where table_schema = 'public' and table_name = 'my_client_contacts';
  if cols is distinct from 'client_name,client_slug,last_call_at,last_inbound_at,last_logged_on,last_outbound_at,unanswered_outbound' then
    raise exception 'FAILED: my_client_contacts exposes unexpected columns: %', cols;
  end if;
  raise notice 'ok: developer contact view has only names and dates';
end;
$$;

-- ---------------------------------------------------------------------------
-- 7h. Review before done (0011): developers send for review; managers approve.
-- ---------------------------------------------------------------------------
-- A simple follow-up for the developer (they may still mark these done).
insert into public.actions (id, client_id, kind, title, owner_staff_id, created_by) values
  ('00000000-0000-0000-0000-00000000af01', '00000000-0000-0000-0000-0000000000c1', 'follow_up', 'Send report link (test)', '00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000a1');

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","aal":"aal2"}';
select test.expect($$update public.actions set status = 'done', done_at = now() where id = '00000000-0000-0000-0000-00000000ae01'$$, -1, 'developer cannot mark a work order done');
select test.expect($$update public.actions set status = 'done', done_at = now() where id = '00000000-0000-0000-0000-00000000ad01'$$, -1, 'developer cannot mark an issue done');
select test.expect($$update public.actions set status = 'review' where id = '00000000-0000-0000-0000-00000000ae01'$$, 1, 'developer sends a work order for review');
select test.expect($$select * from public.actions where id = '00000000-0000-0000-0000-00000000ae01' and submitted_at is not null$$, 1, 'the database stamps when it was sent for review');
select test.expect($$update public.actions set submitted_at = '2020-01-02' where id = '00000000-0000-0000-0000-00000000ae01'$$, -1, 'developer cannot backdate the review time');
select test.expect($$update public.actions set sent_back_count = 0 where id = '00000000-0000-0000-0000-00000000ae01'$$, -1, 'developer cannot reset the sent-back count');
select test.expect($$update public.actions set review_note = 'looks great' where id = '00000000-0000-0000-0000-00000000ae01'$$, -1, 'developer cannot write the review note');
select test.expect($$update public.actions set status = 'done', done_at = now() where id = '00000000-0000-0000-0000-00000000af01'$$, 1, 'developer can still mark a simple follow-up done');
select test.expect($$update public.actions set status = 'finished' where id = '00000000-0000-0000-0000-00000000ae01'$$, -2, 'unknown statuses are still rejected');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","aal":"aal2"}';
select test.expect($$update public.actions set status = 'open', review_note = 'Form still errors on mobile (test)' where id = '00000000-0000-0000-0000-00000000ae01' and status = 'review'$$, 1, 'manager sends work back with a note');
select test.expect($$select * from public.actions where id = '00000000-0000-0000-0000-00000000ae01' and sent_back_count = 1$$, 1, 'the database counts the send-back');
select test.expect($$update public.actions set review_note = repeat('x', 201) where id = '00000000-0000-0000-0000-00000000ae01'$$, -2, 'review notes are length-limited');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","aal":"aal2"}';
select test.expect($$select * from public.my_work where id = '00000000-0000-0000-0000-00000000ae01' and review_note is not null and sent_back_count = 1$$, 1, 'developer sees the send-back note in my_work');
select test.expect($$update public.actions set status = 'review' where id = '00000000-0000-0000-0000-00000000ae01'$$, 1, 'developer sends it for review again');
select test.expect($$update public.actions set status = 'in_progress' where id = '00000000-0000-0000-0000-00000000ae01'$$, 1, 'developer can pull it back from review');
select test.expect($$select * from public.actions where id = '00000000-0000-0000-0000-00000000ae01' and sent_back_count = 1$$, 1, 'a developer pulling it back is not counted as sent back');
select test.expect($$update public.actions set status = 'review' where id = '00000000-0000-0000-0000-00000000ae01'$$, 1, 'developer re-submits');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","aal":"aal2"}';
select test.expect($$update public.actions set status = 'done', done_at = now(), review_note = null where id = '00000000-0000-0000-0000-00000000ae01' and status = 'review'$$, 1, 'manager approves it as done');
select test.expect($$update public.actions set submitted_at = now() where id = '00000000-0000-0000-0000-00000000ae01'$$, -1, 'nobody sets the review time by hand');
commit;

-- ---------------------------------------------------------------------------
-- 7i. Owner summary (0012): one key-checked read for the owner's dashboard.
-- ---------------------------------------------------------------------------
-- The key's fingerprint, set by the owner in the SQL Editor (here: a fictional key).
insert into private.owner_summary_key (id, token_sha256)
  values (1, encode(sha256(convert_to('test-key-0123456789abcdef0123456789abcdef', 'UTF8')), 'hex'));

begin;
set local role anon;
select test.expect('select * from public.owner_summary_snapshots', -1, 'signed out cannot read summaries');
select test.expect('select * from public.owner_summary_calls', -1, 'signed out cannot read the call log');
select test.expect('select * from private.owner_summary_key', -1, 'signed out cannot read the key fingerprint');
select test.expect($$insert into public.owner_summary_snapshots (content, created_by) values ('{}', '00000000-0000-0000-0000-0000000000a1')$$, -1, 'signed out cannot publish');
select test.expect($$select 1 where public.owner_summary_latest('wrong-key-0123456789abcdef0123456789abcdef') is null$$, 1, 'a wrong key gets nothing');
select test.expect($$select 1 where public.owner_summary_latest('short') is null$$, 1, 'a short key gets nothing');
select test.expect($$select 1 where public.owner_summary_latest(null) is null$$, 1, 'no key gets nothing');
select test.expect($$select 1 where public.owner_summary_latest('test-key-0123456789abcdef0123456789abcdef') ->> 'status' = 'no_snapshot'$$, 1, 'the right key before anything is published says so');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","aal":"aal2"}';
select test.expect($$insert into public.owner_summary_snapshots (content) values ('{"schema":"owner-summary/v1"}')$$, -1, 'manager cannot publish a summary');
select test.expect('select * from public.owner_summary_snapshots', 0, 'manager cannot read summaries');
select test.expect('select * from public.owner_summary_calls', 0, 'manager cannot read the call log');
select test.expect($$select public.owner_summary_latest('test-key-0123456789abcdef0123456789abcdef')$$, -1, 'signed-in users cannot call the dashboard read');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","aal":"aal2"}';
select test.expect($$insert into public.owner_summary_snapshots (content) values ('{"schema":"owner-summary/v1"}')$$, -1, 'developer cannot publish a summary');
select test.expect('select * from public.owner_summary_snapshots', 0, 'developer cannot read summaries');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","aal":"aal1"}';
select test.expect($$insert into public.owner_summary_snapshots (content) values ('{"schema":"owner-summary/v1"}')$$, -1, 'owner without two-factor cannot publish');
select test.expect('select * from public.owner_summary_calls', 0, 'owner without two-factor cannot read the call log');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","aal":"aal2"}';
select test.expect($$insert into public.owner_summary_snapshots (content) values ('{"schema":"owner-summary/v1","metrics":[{"key":"mrr","value":18500}]}')$$, 1, 'owner publishes a summary');
select test.expect($$insert into public.owner_summary_snapshots (content) values ('{"lists":[{"items":[{"name":"pat@example.com"}]}]}')$$, -2, 'a summary with an email address is rejected');
select test.expect($$insert into public.owner_summary_snapshots (content) values ('{"lists":[{"items":[{"detail":"call 555-010-1234"}]}]}')$$, -2, 'a summary with a phone number is rejected');
select test.expect($$insert into public.owner_summary_snapshots (content) values ('{"generated_at":"2026-11-08T15:04:05.123Z","value":1234567}')$$, 1, 'dates and amounts are not mistaken for phone numbers');
select test.expect($$insert into public.owner_summary_snapshots (content, created_by) values ('{}', '00000000-0000-0000-0000-0000000000a2')$$, -1, 'cannot publish as someone else');
select test.expect($$update public.owner_summary_snapshots set content = '{}'$$, -1, 'summaries cannot be edited');
select test.expect($$delete from public.owner_summary_snapshots$$, -1, 'summaries cannot be deleted');
select test.expect($$insert into public.owner_summary_calls (outcome) values ('ok')$$, -1, 'nobody writes the call log by hand');
select test.expect('select * from private.owner_summary_key', -1, 'even the owner cannot read the key fingerprint through the app');
commit;

begin;
set local role anon;
select test.expect($$select 1 where public.owner_summary_latest('test-key-0123456789abcdef0123456789abcdef') -> 'content' ->> 'generated_at' = '2026-11-08T15:04:05.123Z'$$, 1, 'the right key gets the latest summary');
select test.expect($$select 1 from (select public.owner_summary_latest('test-key-0123456789abcdef0123456789abcdef') as r) q where jsonb_typeof(r -> 'content') = 'object' and (select count(*) from jsonb_object_keys(r)) = 3$$, 1, 'the read returns only status, time and the summary');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","aal":"aal2"}';
select test.expect($$select * from public.owner_summary_calls where outcome = 'ok' and snapshot_id is not null$$, 2, 'each successful read is recorded');
select test.expect($$select * from public.owner_summary_calls where outcome = 'no_snapshot'$$, 1, 'the read before publishing is recorded too');
select test.expect($$update public.owner_summary_calls set outcome = 'ok'$$, -1, 'the call log cannot be edited');
select test.expect($$delete from public.owner_summary_calls$$, -1, 'the call log cannot be deleted');
commit;

-- Rate limit: at most 30 reads in 10 minutes, then "limited".
begin;
set local role anon;
do $$
declare r jsonb;
begin
  for i in 1..40 loop
    r := public.owner_summary_latest('test-key-0123456789abcdef0123456789abcdef');
  end loop;
  if r ->> 'status' is distinct from 'limited' then raise exception 'FAILED: rate limit (got %)', r ->> 'status'; end if;
  raise notice 'ok: the dashboard read is rate limited';
end;
$$;
commit;

-- The ONLY function signed-out callers may run is the dashboard read.
do $$
declare bad text;
begin
  select string_agg(p.proname, ', ') into bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and has_function_privilege('anon', p.oid, 'execute')
    and p.proname <> 'owner_summary_latest';
  if bad is not null then raise exception 'FAILED: signed-out callers can run: %', bad; end if;
  raise notice 'ok: signed-out callers can run only the dashboard read';
end;
$$;

-- ---------------------------------------------------------------------------
-- 7j. Cancel (0013): only the owner cancels or restores; developers never see it.
-- ---------------------------------------------------------------------------
insert into public.actions (id, client_id, kind, title, owner_staff_id, created_by) values
  ('00000000-0000-0000-0000-00000000ca01', '00000000-0000-0000-0000-0000000000c1', 'work_order', 'Old landing page fix (test)', '00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000a1');

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","aal":"aal2"}';
select test.expect($$select * from public.my_work where id = '00000000-0000-0000-0000-00000000ca01'$$, 1, 'developer sees their work order before it is canceled');
select test.expect($$update public.actions set status = 'canceled' where id = '00000000-0000-0000-0000-00000000ca01'$$, -1, 'developer cannot cancel their own work order');
select test.expect($$update public.actions set cancel_note = 'x' where id = '00000000-0000-0000-0000-00000000ca01'$$, -1, 'developer cannot write a cancel reason');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","aal":"aal2"}';
select test.expect($$update public.actions set status = 'canceled' where id = '00000000-0000-0000-0000-00000000ca01'$$, -1, 'manager cannot cancel work');
select test.expect($$insert into public.actions (client_id, kind, title, status) values ('00000000-0000-0000-0000-0000000000c1', 'work_order', 'x', 'canceled')$$, -2, 'new items cannot start out canceled');
select test.expect($$delete from public.actions where id = '00000000-0000-0000-0000-00000000ca01'$$, 0, 'manager still cannot delete work (nothing deleted)');
select test.expect($$insert into public.ai_usage (feature, model, input_tokens, output_tokens, cost_usd, outcome) values ('quick_add', 'm', 1, 1, 0.01, 'ok')$$, 1, 'quick add is cost-logged');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","aal":"aal1"}';
select test.expect($$update public.actions set status = 'canceled' where id = '00000000-0000-0000-0000-00000000ca01'$$, 0, 'owner without two-factor cannot cancel');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","aal":"aal2"}';
select test.expect($$update public.actions set status = 'canceled', cancel_note = 'Duplicate (test)', canceled_at = '2020-01-01' where id = '00000000-0000-0000-0000-00000000ca01'$$, -1, 'nobody types the cancel time, not even the owner');
select test.expect($$update public.actions set status = 'canceled', cancel_note = 'Duplicate (test)' where id = '00000000-0000-0000-0000-00000000ca01'$$, 1, 'owner cancels a work order with a reason');
select test.expect($$select * from public.actions where id = '00000000-0000-0000-0000-00000000ca01' and canceled_at > now() - interval '1 minute'$$, 1, 'the database stamps the cancel time');
select test.expect($$update public.actions set cancel_note = repeat('x', 201) where id = '00000000-0000-0000-0000-00000000ca01'$$, -2, 'cancel reasons are length-limited');
select test.expect($$delete from public.actions where id = '00000000-0000-0000-0000-00000000ca01'$$, 0, 'even the owner cannot delete work outside Trash (cancel keeps it)');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","aal":"aal2"}';
select test.expect($$select * from public.my_work where id = '00000000-0000-0000-0000-00000000ca01'$$, 0, 'developer no longer sees a canceled work order');
select test.expect($$update public.actions set status = 'open' where id = '00000000-0000-0000-0000-00000000ca01'$$, -1, 'developer cannot restore canceled work');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","aal":"aal2"}';
select test.expect($$update public.actions set status = 'open' where id = '00000000-0000-0000-0000-00000000ca01'$$, -1, 'manager cannot restore canceled work');
select test.expect($$select * from public.actions where id = '00000000-0000-0000-0000-00000000ca01' and status = 'canceled'$$, 1, 'managers can still see canceled work (history)');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","aal":"aal2"}';
select test.expect($$update public.actions set status = 'open' where id = '00000000-0000-0000-0000-00000000ca01'$$, 1, 'owner restores canceled work');
select test.expect($$select * from public.actions where id = '00000000-0000-0000-0000-00000000ca01' and canceled_at is null and cancel_note is null$$, 1, 'restoring clears the cancel time and reason');
commit;

-- ---------------------------------------------------------------------------
-- 7k. Kit (0014): pages by audience, history only by the database, tools for managers.
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","aal":"aal2"}';
select test.expect($$select * from public.kit_docs where kind = 'readme'$$, 1, 'the starter README is there');
select test.expect($$insert into public.kit_docs (id, kind, title, body, audience, updated_by) values ('00000000-0000-0000-0000-00000000d001', 'sop', 'Monthly SEO check (test)', E'# Steps\n- Check rankings', '{manager,developer}', '00000000-0000-0000-0000-0000000000a2')$$, 1, 'manager adds an SOP for developers');
select test.expect($$insert into public.kit_docs (id, kind, title, body, audience, updated_by) values ('00000000-0000-0000-0000-00000000d002', 'template', 'Pricing talk (test)', 'Managers only', '{manager}', '00000000-0000-0000-0000-0000000000a2')$$, 1, 'manager adds a managers-only page');
select test.expect($$insert into public.kit_docs (kind, title, body, updated_by) values ('sop', 'x', 'x', '00000000-0000-0000-0000-0000000000a1')$$, -1, 'nobody saves a page in someone else''s name');
select test.expect($$insert into public.kit_docs (kind, title, body, updated_by) values ('wiki', 'x', 'x', '00000000-0000-0000-0000-0000000000a2')$$, -2, 'unknown page kinds are rejected');
select test.expect($$insert into public.kit_docs (kind, title, body, audience, updated_by) values ('sop', 'x', 'x', '{stranger}', '00000000-0000-0000-0000-0000000000a2')$$, -2, 'unknown audiences are rejected');
select test.expect($$insert into public.kit_docs (kind, title, body, updated_by) values ('sop', 'Logins (test)', 'WordPress password: hunter2', '00000000-0000-0000-0000-0000000000a2')$$, -2, 'pages with a password in them are refused');
select test.expect($$insert into public.kit_docs (kind, title, body, updated_by) values ('sop', 'Keys (test)', 'use sk-abcdefghijklmnopqrstuvwxyz123', '00000000-0000-0000-0000-0000000000a2')$$, -2, 'pages with an API key in them are refused');
select test.expect($$update public.kit_docs set body = E'# Steps\n- Check rankings\n- Check Search Console' where id = '00000000-0000-0000-0000-00000000d001'$$, 1, 'manager edits the SOP');
select test.expect($$select * from public.kit_doc_versions where doc_id = '00000000-0000-0000-0000-00000000d001'$$, 2, 'the database keeps every saved version');
select test.expect($$update public.kit_docs set reviewed_on = current_date where id = '00000000-0000-0000-0000-00000000d001'$$, 1, 'manager marks it reviewed');
select test.expect($$select * from public.kit_doc_versions where doc_id = '00000000-0000-0000-0000-00000000d001'$$, 2, 'marking reviewed is not a new version');
select test.expect($$insert into public.kit_doc_versions (doc_id, title, body) values ('00000000-0000-0000-0000-00000000d001', 'fake', 'fake')$$, -1, 'nobody writes history by hand');
select test.expect($$update public.kit_doc_versions set body = 'changed'$$, -1, 'nobody edits history');
select test.expect($$delete from public.kit_doc_versions$$, -1, 'nobody deletes history');
select test.expect($$delete from public.kit_docs$$, -1, 'pages cannot be deleted (archive instead)');
select test.expect($$update public.kit_docs set updated_at = '2020-01-01' where id = '00000000-0000-0000-0000-00000000d001'$$, -1, 'nobody backdates a page');
select test.expect($$insert into public.kit_tools (id, name, purpose, url, login_where, monthly_usd, for_developers) values ('00000000-0000-0000-0000-00000000d101', 'Rank tracker (test)', 'Keyword rankings', 'https://tracker.example.com', 'Team password manager', 49, true)$$, 1, 'manager adds a tool');
select test.expect($$insert into public.kit_tools (id, name, monthly_usd) values ('00000000-0000-0000-0000-00000000d102', 'Billing app (test)', 99)$$, 1, 'manager adds a managers-only tool');
select test.expect($$insert into public.kit_tools (name, login_where) values ('x', 'password: hunter2')$$, -2, 'a password in the tools list is refused');
select test.expect($$insert into public.kit_tools (name, url) values ('x', 'javascript:alert(1)')$$, -2, 'tool links must be https');
select test.expect($$delete from public.kit_tools$$, -1, 'tools cannot be deleted (archive instead)');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","aal":"aal2"}';
select test.expect($$select * from public.kit_docs$$, 2, 'developer reads the README and the SOP meant for them');
select test.expect($$select * from public.kit_docs where id = '00000000-0000-0000-0000-00000000d002'$$, 0, 'developer cannot read managers-only pages');
select test.expect($$update public.kit_docs set body = 'changed' where id = '00000000-0000-0000-0000-00000000d001'$$, 0, 'developer cannot edit SOPs');
select test.expect($$insert into public.kit_docs (kind, title, body, updated_by) values ('faq', 'x', 'x', '00000000-0000-0000-0000-0000000000a3')$$, -1, 'developer cannot add pages');
select test.expect($$select * from public.kit_doc_versions$$, 0, 'developer cannot read page history');
select test.expect($$select * from public.kit_tools$$, 0, 'developer cannot read the full tools list (costs)');
select test.expect($$select * from public.team_tools$$, 1, 'developer sees only tools marked for developers');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","aal":"aal2"}';
select test.expect($$update public.kit_docs set archived = true where id = '00000000-0000-0000-0000-00000000d001'$$, 1, 'manager archives a page');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","aal":"aal2"}';
select test.expect($$select * from public.kit_docs where id = '00000000-0000-0000-0000-00000000d001'$$, 0, 'developer no longer sees an archived page');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","aal":"aal1"}';
select test.expect($$select * from public.kit_docs$$, 0, 'no pages without two-factor');
select test.expect($$select * from public.team_tools$$, 0, 'no tools without two-factor');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a4","aal":"aal2"}';
select test.expect($$select * from public.kit_docs$$, 0, 'non-team user reads no pages');
select test.expect($$select * from public.team_tools$$, 0, 'non-team user sees no tools');
commit;

begin;
set local role anon;
select test.expect($$select * from public.kit_docs$$, -1, 'signed out cannot read pages');
select test.expect($$select * from public.team_tools$$, -1, 'signed out cannot read tools');
commit;

-- The developer tools view must never show costs or notes.
do $$
declare cols text;
begin
  select string_agg(column_name, ',' order by column_name) into cols
  from information_schema.columns where table_schema = 'public' and table_name = 'team_tools';
  if cols is distinct from 'id,login_where,name,purpose,url' then
    raise exception 'FAILED: team_tools exposes unexpected columns: %', cols;
  end if;
  raise notice 'ok: developer tools view has no costs or notes';
end;
$$;

-- ---------------------------------------------------------------------------
-- 7l. Billing (0015): owner only, read-only copy, no deletes, 10-minute refresh limit.
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","aal":"aal2"}';
select test.expect($$insert into public.billing_syncs (id) values ('00000000-0000-0000-0000-00000000b501')$$, 1, 'owner starts a billing refresh');
select test.expect($$insert into public.billing_syncs default values$$, -2, 'a second refresh within 10 minutes is refused by the database');
select test.expect($$update public.billing_syncs set finished_at = now(), ok = true, invoices_read = 2, payments_read = 1, unmatched = 1 where id = '00000000-0000-0000-0000-00000000b501'$$, 1, 'owner records how the refresh went');
select test.expect($$update public.billing_syncs set started_at = '2020-01-01' where id = '00000000-0000-0000-0000-00000000b501'$$, -1, 'nobody backdates a refresh to dodge the limit');
select test.expect($$insert into public.billing_records (kind, provider_id, provider_contact_id, client_id, amount_cents, amount_due_cents, currency, status, issued_on, due_on) values ('invoice', 'inv1', 'contactA1', '00000000-0000-0000-0000-0000000000c1', 75000, 75000, 'USD', 'overdue', '2026-10-01', '2026-10-15')$$, 1, 'owner saves a matched invoice');
select test.expect($$insert into public.billing_records (kind, provider_id, provider_contact_id, unmatched_label, amount_cents, currency, status) values ('invoice', 'inv2', 'contactB2', 'Sample Bakery (fictional)', 30000, 'USD', 'open')$$, 1, 'owner saves an unmatched invoice with its name');
select test.expect($$insert into public.billing_records (kind, provider_id, amount_cents, currency, status) values ('invoice', 'inv1', 1, 'USD', 'open')$$, -3, 'the same invoice cannot be saved twice');
select test.expect($$insert into public.billing_records (kind, provider_id, amount_cents, currency, status) values ('invoice', 'inv3', 1, 'USD', 'void')$$, -2, 'unknown statuses (void) are refused');
select test.expect($$insert into public.billing_records (kind, provider_id, amount_cents, currency, status) values ('invoice', 'inv4', -5, 'USD', 'open')$$, -2, 'negative amounts are refused');
select test.expect($$insert into public.billing_records (kind, provider_id, unmatched_label, amount_cents, currency, status) values ('invoice', 'inv5', 'pat@example.com', 1, 'USD', 'open')$$, -2, 'an email as the invoice name is refused');
select test.expect($$insert into public.billing_records (kind, provider_id, unmatched_label, amount_cents, currency, status) values ('invoice', 'inv6', 'Call 555-0100 now', 1, 'USD', 'open')$$, -2, 'a phone number as the invoice name is refused');
select test.expect($$insert into public.billing_records (kind, provider_id, client_id, unmatched_label, amount_cents, currency, status) values ('invoice', 'inv7', '00000000-0000-0000-0000-0000000000c1', 'Pat', 1, 'USD', 'open')$$, -2, 'a matched invoice cannot keep the name');
select test.expect($$insert into public.billing_contact_matches (provider_contact_id, client_id) values ('contactB2', '00000000-0000-0000-0000-0000000000c1')$$, 1, 'owner matches a contact by hand');
select test.expect($$insert into public.billing_contact_matches (provider_contact_id, client_id, matched_by) values ('contactC3', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a2')$$, -1, 'nobody matches in someone else''s name');
select test.expect($$update public.billing_records set client_id = '00000000-0000-0000-0000-0000000000c1', unmatched_label = null where provider_contact_id = 'contactB2'$$, 1, 'owner attaches the matched invoice (name cleared)');
select test.expect($$update public.billing_records set provider_id = 'changed' where provider_id = 'inv1'$$, -1, 'the provider ID cannot be changed');
select test.expect($$insert into public.billing_records (kind, provider_id, provider_contact_id, client_id, amount_cents, amount_due_cents, currency, status, issued_on, due_on) values ('invoice', 'inv1', 'contactA1', '00000000-0000-0000-0000-0000000000c1', 75000, 0, 'USD', 'paid', '2026-10-01', '2026-10-15') on conflict (provider, kind, provider_id) do update set provider_id = excluded.provider_id, kind = excluded.kind, amount_due_cents = excluded.amount_due_cents, status = excluded.status$$, 1, 'a refresh re-saves an existing invoice by its ID');
select test.expect($$delete from public.billing_records$$, -1, 'billing records cannot be deleted, even by the owner');
select test.expect($$delete from public.billing_contact_matches$$, -1, 'matches cannot be deleted');
select test.expect($$delete from public.billing_syncs$$, -1, 'refresh history cannot be deleted');
select test.expect($$insert into public.activity (kind, summary, actor) values ('billing_sync', 'Billing refreshed: 3 records read, 1 unmatched', '00000000-0000-0000-0000-0000000000a1')$$, 1, 'owner logs a refresh in the history (counts only)');
select test.expect($$insert into public.activity (kind, summary, actor) values ('billing_sync', 'Billing refreshed: $750 collected', '00000000-0000-0000-0000-0000000000a1')$$, -2, 'a billing history line with money in it is refused');
select test.expect($$insert into public.activity (kind, summary, actor, client_id) values ('billing_sync', 'Billing refreshed', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1')$$, -2, 'a billing history line is never tied to a client');
select test.expect($$select * from public.billing_records$$, 2, 'owner reads billing');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","aal":"aal2"}';
select test.expect($$select * from public.billing_records$$, 0, 'manager reads no billing records');
select test.expect($$select * from public.billing_contact_matches$$, 0, 'manager reads no billing matches');
select test.expect($$select * from public.billing_syncs$$, 0, 'manager reads no billing refreshes');
select test.expect($$insert into public.billing_records (kind, provider_id, amount_cents, currency, status) values ('invoice', 'm1', 1, 'USD', 'open')$$, -1, 'manager cannot add billing records');
select test.expect($$update public.billing_records set status = 'paid'$$, 0, 'manager cannot change billing records');
select test.expect($$insert into public.billing_contact_matches (provider_contact_id, client_id) values ('contactD4', '00000000-0000-0000-0000-0000000000c1')$$, -1, 'manager cannot match billing contacts');
select test.expect($$insert into public.billing_syncs default values$$, -1, 'manager cannot start a billing refresh');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","aal":"aal2"}';
select test.expect($$select * from public.billing_records$$, 0, 'developer reads no billing records');
select test.expect($$select * from public.billing_contact_matches$$, 0, 'developer reads no billing matches');
select test.expect($$select * from public.billing_syncs$$, 0, 'developer reads no billing refreshes');
select test.expect($$update public.billing_records set status = 'paid'$$, 0, 'developer cannot change billing records');
select test.expect($$insert into public.billing_syncs default values$$, -1, 'developer cannot start a billing refresh');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a4","aal":"aal2"}';
select test.expect($$select * from public.billing_records$$, 0, 'non-team user reads no billing');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","aal":"aal1"}';
select test.expect($$select * from public.billing_records$$, 0, 'owner without two-factor reads no billing');
commit;

begin;
set local role anon;
select test.expect($$select * from public.billing_records$$, -1, 'signed out cannot read billing records');
select test.expect($$select * from public.billing_syncs$$, -1, 'signed out cannot read billing refreshes');
commit;

-- The billing copy keeps only the approved columns (no card, email, phone or address column can sneak in).
do $$
declare cols text;
begin
  select string_agg(column_name, ',' order by column_name) into cols
  from information_schema.columns where table_schema = 'public' and table_name = 'billing_records';
  if cols is distinct from 'amount_cents,amount_due_cents,client_id,currency,due_on,id,issued_on,kind,paid_on,provider,provider_contact_id,provider_id,status,synced_at,unmatched_label' then
    raise exception 'FAILED: billing_records has unexpected columns: %', cols;
  end if;
  raise notice 'ok: billing keeps only the approved columns';
end;
$$;

-- ---------------------------------------------------------------------------
-- 7m. Step tick boxes (0016) and "Preview as developer" drift check.
-- ---------------------------------------------------------------------------
insert into public.clients (id, slug, name, monthly_usd, start_date, status, services, owner_staff_id) values
  ('00000000-0000-0000-0000-0000000000c7', 'owned-by-dev', 'Owned By Dev (fictional)', 100, '2026-01-05', 'active', '{SEO}', '00000000-0000-0000-0000-0000000000b3'),
  ('00000000-0000-0000-0000-0000000000c8', 'not-theirs', 'Not Theirs (fictional)', 100, '2026-01-05', 'active', '{SEO}', '00000000-0000-0000-0000-0000000000b2');
insert into public.actions (id, client_id, kind, title, owner_staff_id, steps, created_by) values
  ('00000000-0000-0000-0000-000000005d01', '00000000-0000-0000-0000-0000000000c1', 'work_order', 'Three steps (test)', '00000000-0000-0000-0000-0000000000b3', E'First\nSecond\nThird', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-000000005d02', '00000000-0000-0000-0000-0000000000c8', 'work_order', 'Not theirs (test)', '00000000-0000-0000-0000-0000000000b2', E'One\nTwo', '00000000-0000-0000-0000-0000000000a1');
insert into public.actions (id, client_id, kind, title, owner_staff_id, status, done_at, created_by) values
  ('00000000-0000-0000-0000-000000005d03', '00000000-0000-0000-0000-0000000000c1', 'follow_up', 'Done long ago (test)', '00000000-0000-0000-0000-0000000000b3', 'done', now() - interval '20 days', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-000000005d04', '00000000-0000-0000-0000-0000000000c1', 'follow_up', 'Done lately (test)', '00000000-0000-0000-0000-0000000000b3', 'done', now() - interval '3 days', '00000000-0000-0000-0000-0000000000a1');

select test.expect($$select * from public.actions where id = '00000000-0000-0000-0000-000000005d01' and steps_done = '{}'$$, 1, 'new items start with no ticks');

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","aal":"aal2"}';
select test.expect($$update public.actions set steps_done = '{3,1}' where id = '00000000-0000-0000-0000-000000005d01'$$, 1, 'developer ticks steps on their own work order');
select test.expect($$select * from public.my_work where id = '00000000-0000-0000-0000-000000005d01' and steps_done = '{1,3}'$$, 1, 'ticks are kept in order and shown in my_work');
select test.expect($$update public.actions set steps_done = '{4}' where id = '00000000-0000-0000-0000-000000005d01'$$, -2, 'a step that does not exist cannot be ticked');
select test.expect($$update public.actions set steps_done = '{0}' where id = '00000000-0000-0000-0000-000000005d01'$$, -2, 'step numbers start at 1');
select test.expect($$update public.actions set steps_done = '{2,2}' where id = '00000000-0000-0000-0000-000000005d01'$$, -2, 'a step cannot be ticked twice');
select test.expect($$update public.actions set steps_done = '{1}' where id = '00000000-0000-0000-0000-000000005d02'$$, 0, 'developer cannot tick someone else''s steps');
select test.expect($$update public.actions set steps = 'x', steps_done = '{}' where id = '00000000-0000-0000-0000-000000005d01'$$, -1, 'developer still cannot change the steps themselves');
select test.expect($$update public.actions set title = 'x', steps_done = '{1}' where id = '00000000-0000-0000-0000-000000005d01'$$, -1, 'ticking does not unlock other columns');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","aal":"aal1"}';
select test.expect($$update public.actions set steps_done = '{2}' where id = '00000000-0000-0000-0000-000000005d01'$$, 0, 'developer without two-factor cannot tick');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","aal":"aal2"}';
select test.expect($$update public.actions set steps_done = '{1,2}' where id = '00000000-0000-0000-0000-000000005d02'$$, 1, 'manager can tick steps on anyone''s work order');
select test.expect($$update public.actions set steps = E'One\nTwo\nThree' where id = '00000000-0000-0000-0000-000000005d02'$$, 1, 'manager edits the steps');
select test.expect($$select * from public.actions where id = '00000000-0000-0000-0000-000000005d02' and steps_done = '{}'$$, 1, 'changing the steps clears the ticks');
commit;

begin;
set local role anon;
select test.expect($$update public.actions set steps_done = '{1}'$$, -1, 'signed out cannot tick');
commit;

-- Drift check: the preview (src/lib/ops.ts developerWorkScope / developerClientScope)
-- uses these rules. The real developer views must return exactly the same rows.
create temp table preview_expected_work as
  select a.id from public.actions a
  where a.owner_staff_id = '00000000-0000-0000-0000-0000000000b3'
    and a.status <> 'canceled'
    and (a.status <> 'done' or a.done_at > now() - interval '14 days');
create temp table preview_expected_clients as
  select c.slug from public.clients c
  where c.owner_staff_id = '00000000-0000-0000-0000-0000000000b3'
     or exists (select 1 from preview_expected_work w join public.actions a on a.id = w.id where a.client_id = c.id);
grant select on preview_expected_work, preview_expected_clients to authenticated;
select test.expect('select * from preview_expected_work where id is not null', (select count(*) from preview_expected_work), 'drift check reads its expected list');
select test.expect($$select * from preview_expected_work where id = '00000000-0000-0000-0000-000000005d04'$$, 1, 'drift check includes a recently finished item');

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","aal":"aal2"}';
select test.expect($$(select id from public.my_work except select id from preview_expected_work) union all (select id from preview_expected_work except select id from public.my_work)$$, 0, 'my_work returns exactly the items the preview rules pick');
select test.expect($$select * from public.my_work where id = '00000000-0000-0000-0000-000000005d03'$$, 0, 'items done over 14 days ago drop off (both places)');
select test.expect($$(select client_slug from public.my_client_contacts except select slug from preview_expected_clients) union all (select slug from preview_expected_clients except select client_slug from public.my_client_contacts)$$, 0, 'my_client_contacts returns exactly the clients the preview rules pick');
select test.expect($$select * from public.my_client_contacts where client_slug = 'owned-by-dev'$$, 1, 'a client the developer owns shows even with no work');
select test.expect($$select * from public.my_client_contacts where client_slug = 'not-theirs'$$, 0, 'someone else''s client stays hidden');
commit;

-- ---------------------------------------------------------------------------
-- 7n. Work Orders phase 1 (0017): two developers, comments, history, notices, archive.
--     a3 = developer 1 (staff b3); a5 = developer 2 (staff b5).
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a5', 'developer2@example.com');
insert into public.staff (id, name, role) values ('00000000-0000-0000-0000-0000000000b5', 'Dev C (test)', 'seo_developer');
insert into public.team_members (user_id, display_name, role, staff_id) values ('00000000-0000-0000-0000-0000000000a5', 'Developer 2 (test)', 'developer', '00000000-0000-0000-0000-0000000000b5');

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","aal":"aal2"}';
select test.expect($$insert into public.actions (id, client_id, kind, title, owner_staff_id, due_on, created_by) values ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-0000000000c1', 'work_order', 'Landing page (test)', '00000000-0000-0000-0000-0000000000b3', '2026-11-20', '00000000-0000-0000-0000-0000000000a2')$$, 1, 'manager creates a work order for developer 1');
select test.expect($$insert into public.actions (id, client_id, kind, title, owner_staff_id, created_by) values ('00000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-0000000000c1', 'work_order', 'SEO report (test)', '00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000000a2')$$, 1, 'manager creates a work order for developer 2');
select test.expect($$insert into public.work_order_comments (action_id, body) values ('00000000-0000-0000-0000-00000000f002', 'Use the new logo (test)')$$, 1, 'manager comments on developer 2''s work order');
select test.expect($$update public.actions set links = '{http://example.com}' where id = '00000000-0000-0000-0000-00000000f001'$$, -2, 'links must be https');
select test.expect($$update public.actions set links = '{https://user:pw@example.com}' where id = '00000000-0000-0000-0000-00000000f001'$$, -2, 'links cannot carry a login');
select test.expect($$update public.actions set links = '{https://a.example.com,https://b.example.com,https://c.example.com,https://d.example.com,https://e.example.com,https://f.example.com}' where id = '00000000-0000-0000-0000-00000000f001'$$, -2, 'at most 5 links');
select test.expect($$update public.actions set links = '{https://www.figma.com/file/x,https://example.com}', start_on = '2026-11-12' where id = '00000000-0000-0000-0000-00000000f001'$$, 1, 'manager adds links and a start date');
select test.expect($$update public.actions set start_on = '2026-12-30' where id = '00000000-0000-0000-0000-00000000f001'$$, -2, 'start date cannot be after the due date');
select test.expect($$update public.actions set archived_at = now() where id = '00000000-0000-0000-0000-00000000f002'$$, -1, 'managers cannot archive');
commit;

select test.expect($$select * from public.work_order_history where action_id = '00000000-0000-0000-0000-00000000f001' and field in ('created', 'owner', 'start_on')$$, 3, 'the database records creation, assignee and start date');
select test.expect($$select * from public.notifications where user_id = '00000000-0000-0000-0000-0000000000a3' and kind = 'assigned' and action_id = '00000000-0000-0000-0000-00000000f001'$$, 1, 'developer 1 is notified of the assignment');
select test.expect($$select * from public.notifications where user_id = '00000000-0000-0000-0000-0000000000a2'$$, 0, 'nobody is notified about their own change');

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","aal":"aal2"}';
-- Developer 1 cannot reach developer 2's work order, even by its exact id.
select test.expect($$select * from public.actions where id = '00000000-0000-0000-0000-00000000f002'$$, 0, 'developer cannot read another developer''s work order by guessing its id');
select test.expect($$select * from public.my_work where id = '00000000-0000-0000-0000-00000000f002'$$, 0, 'another developer''s work order is not in my_work');
select test.expect($$update public.actions set status = 'in_progress' where id = '00000000-0000-0000-0000-00000000f002'$$, 0, 'developer cannot edit another developer''s work order');
select test.expect($$select * from public.work_order_comments where action_id = '00000000-0000-0000-0000-00000000f002'$$, 0, 'developer cannot read another developer''s comments');
select test.expect($$select * from public.work_order_history where action_id = '00000000-0000-0000-0000-00000000f002'$$, 0, 'developer cannot read another developer''s history');
select test.expect($$insert into public.work_order_comments (action_id, body) values ('00000000-0000-0000-0000-00000000f002', 'x')$$, -1, 'developer cannot comment on another developer''s work order');
select test.expect($$select * from public.notifications where user_id <> '00000000-0000-0000-0000-0000000000a3'$$, 0, 'developer cannot read other people''s notices');
select test.expect($$update public.notifications set read_at = now() where user_id <> '00000000-0000-0000-0000-0000000000a3'$$, 0, 'developer cannot mark other people''s notices');
-- No billing.
select test.expect('select * from public.billing_records', 0, 'developer cannot read billing records');
select test.expect('select * from public.billing_syncs', 0, 'developer cannot read billing refreshes');
-- Their own work order: status, time, comments, reassignment request.
select test.expect($$select * from public.my_work where id = '00000000-0000-0000-0000-00000000f001' and cardinality(links) = 2 and start_on is not null$$, 1, 'developer sees their work order with links and start date');
select test.expect($$update public.actions set status = 'in_progress', actual_minutes = 90 where id = '00000000-0000-0000-0000-00000000f001'$$, 1, 'developer updates status and time on their own work order');
select test.expect($$insert into public.work_order_comments (action_id, body) values ('00000000-0000-0000-0000-00000000f001', 'Hero section done (test)')$$, 1, 'developer comments on their own work order');
select test.expect($$insert into public.work_order_comments (action_id, body) values ('00000000-0000-0000-0000-00000000f001', 'Email pat@example.com (test)')$$, -2, 'comments refuse email addresses');
select test.expect($$insert into public.work_order_comments (action_id, body) values ('00000000-0000-0000-0000-00000000f001', 'Call 555-010-1234 (test)')$$, -2, 'comments refuse phone numbers');
select test.expect($$insert into public.work_order_comments (action_id, author, body) values ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-0000000000a1', 'x')$$, -1, 'developer cannot comment in someone else''s name');
select test.expect($$insert into public.work_order_comments (action_id, author_name, body) values ('00000000-0000-0000-0000-00000000f001', 'The Owner', 'Signed by me (test)')$$, 1, 'a typed name is ignored…');
select test.expect($$select * from public.work_order_comments where body = 'Signed by me (test)' and author_name = 'Developer (test)'$$, 1, '…the database fills in the real writer''s name');
select test.expect($$update public.actions set reassign_reason = 'Needs a designer (test)' where id = '00000000-0000-0000-0000-00000000f001'$$, 1, 'developer asks for reassignment with a reason');
select test.expect($$select * from public.actions where id = '00000000-0000-0000-0000-00000000f001' and reassign_requested_at is not null$$, 1, 'the request time is stamped by the database');
select test.expect($$update public.actions set reassign_reason = null where id = '00000000-0000-0000-0000-00000000f001'$$, -1, 'developer cannot clear the request (owner or manager decides)');
-- Nothing else.
select test.expect($$update public.actions set owner_staff_id = '00000000-0000-0000-0000-0000000000b5' where id = '00000000-0000-0000-0000-00000000f001'$$, -1, 'developer cannot reassign');
select test.expect($$update public.actions set due_on = '2026-12-01' where id = '00000000-0000-0000-0000-00000000f001'$$, -1, 'developer cannot change the due date');
select test.expect($$update public.actions set start_on = '2026-11-11' where id = '00000000-0000-0000-0000-00000000f001'$$, -1, 'developer cannot change the start date');
select test.expect($$update public.actions set links = '{}' where id = '00000000-0000-0000-0000-00000000f001'$$, -1, 'developer cannot change the links');
select test.expect($$update public.actions set archived_at = now() where id = '00000000-0000-0000-0000-00000000f001'$$, -1, 'developer cannot archive');
select test.expect($$update public.actions set status = 'canceled' where id = '00000000-0000-0000-0000-00000000f001'$$, -1, 'developer cannot cancel');
select test.expect($$insert into public.actions (client_id, kind, title, owner_staff_id, created_by) values ('00000000-0000-0000-0000-0000000000c1', 'work_order', 'x', '00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000a3')$$, -1, 'developer cannot create work orders');
select test.expect($$delete from public.actions where id = '00000000-0000-0000-0000-00000000f001'$$, 0, 'developer cannot delete work orders (nothing deleted)');
select test.expect($$delete from public.work_order_comments$$, -1, 'nobody can delete comments');
select test.expect($$update public.work_order_comments set body = 'x'$$, -1, 'nobody can edit comments');
select test.expect($$insert into public.work_order_history (action_id, field) values ('00000000-0000-0000-0000-00000000f001', 'status')$$, -1, 'nobody can write history by hand');
select test.expect($$insert into public.notifications (user_id, kind, title) values ('00000000-0000-0000-0000-0000000000a3', 'assigned', 'x')$$, -1, 'nobody can write notices by hand');
-- Mute.
select test.expect($$insert into public.notification_settings (muted) values ('{comment}')$$, 1, 'developer mutes comment notices for themselves');
select test.expect($$insert into public.notification_settings (user_id, muted) values ('00000000-0000-0000-0000-0000000000a5', '{assigned}')$$, -1, 'nobody can change someone else''s mutes');
select test.expect($$update public.notification_settings set muted = '{nagging}'$$, -2, 'only known notice kinds can be muted');
commit;

select test.expect($$select * from public.notifications where user_id = '00000000-0000-0000-0000-0000000000a1' and kind = 'reassign_request'$$, 1, 'the owner is notified of the reassignment request');
select test.expect($$select * from public.notifications where user_id = '00000000-0000-0000-0000-0000000000a1' and kind = 'comment'$$, 2, 'the owner is notified for each developer comment (two above)');
select test.expect($$select * from public.work_order_history where action_id = '00000000-0000-0000-0000-00000000f001' and field = 'status' and old_value = 'open' and new_value = 'in_progress' and actor = '00000000-0000-0000-0000-0000000000a3'$$, 1, 'history records who changed the status, from what to what');

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","aal":"aal2"}';
select test.expect($$insert into public.work_order_comments (action_id, body) values ('00000000-0000-0000-0000-00000000f001', 'Looks good (test)')$$, 1, 'manager comments on developer 1''s work order');
select test.expect($$update public.actions set due_on = '2026-11-25' where id = '00000000-0000-0000-0000-00000000f001'$$, 1, 'manager moves the due date');
select test.expect($$update public.actions set owner_staff_id = '00000000-0000-0000-0000-0000000000b5' where id = '00000000-0000-0000-0000-00000000f001'$$, 1, 'manager reassigns the work order to developer 2');
commit;

select test.expect($$select * from public.notifications where user_id = '00000000-0000-0000-0000-0000000000a3' and action_id = '00000000-0000-0000-0000-00000000f001' and kind = 'comment'$$, 0, 'a muted kind is not sent');
select test.expect($$select * from public.notifications where user_id = '00000000-0000-0000-0000-0000000000a3' and action_id = '00000000-0000-0000-0000-00000000f001' and kind = 'due_changed'$$, 1, 'developer 1 was told the due date moved');
select test.expect($$select * from public.notifications where user_id = '00000000-0000-0000-0000-0000000000a3' and action_id = '00000000-0000-0000-0000-00000000f001' and kind = 'unassigned'$$, 1, 'developer 1 is told it was reassigned away');
select test.expect($$select * from public.notifications where user_id = '00000000-0000-0000-0000-0000000000a5' and kind = 'assigned' and action_id = '00000000-0000-0000-0000-00000000f001'$$, 1, 'developer 2 is told it is theirs now');
select test.expect($$select * from public.actions where id = '00000000-0000-0000-0000-00000000f001' and reassign_reason is null and reassign_requested_at is null$$, 1, 'reassigning answers the request');
select test.expect($$select * from public.work_order_history where action_id = '00000000-0000-0000-0000-00000000f001' and field = 'owner' and old_value = 'Dev B (test)' and new_value = 'Dev C (test)' and actor_name = 'Manager (test)'$$, 1, 'history records the reassignment, by name');

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","aal":"aal2"}';
-- Developer 1 loses access the moment it's reassigned.
select test.expect($$select * from public.actions where id = '00000000-0000-0000-0000-00000000f001'$$, 0, 'after reassignment, developer 1 cannot read the work order');
select test.expect($$select * from public.my_work where id = '00000000-0000-0000-0000-00000000f001'$$, 0, 'after reassignment, it leaves developer 1''s list');
select test.expect($$update public.actions set status = 'blocked' where id = '00000000-0000-0000-0000-00000000f001'$$, 0, 'after reassignment, developer 1 cannot edit it');
select test.expect($$select * from public.work_order_comments where action_id = '00000000-0000-0000-0000-00000000f001'$$, 0, 'after reassignment, developer 1 cannot read its comments');
select test.expect($$select * from public.work_order_history where action_id = '00000000-0000-0000-0000-00000000f001'$$, 0, 'after reassignment, developer 1 cannot read its history');
select test.expect($$insert into public.work_order_comments (action_id, body) values ('00000000-0000-0000-0000-00000000f001', 'x')$$, -1, 'after reassignment, developer 1 cannot comment');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a5","aal":"aal2"}';
select test.expect($$select * from public.work_order_comments where action_id = '00000000-0000-0000-0000-00000000f001'$$, 3, 'developer 2 now sees the whole comment thread');
select test.expect($$select * from public.work_order_comments where action_id = '00000000-0000-0000-0000-00000000f001' and author_name in ('Developer (test)', 'Manager (test)')$$, 3, 'comments show the writer''s team name (filled by the database)');
-- assigned f002, manager's comment on f002, assigned f001
select test.expect($$select * from public.notifications$$, 3, 'developer 2 sees only their own notices');
select test.expect($$update public.notifications set read_at = now()$$, 3, 'developer 2 marks their notices read');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a5","aal":"aal1"}';
select test.expect($$select * from public.notifications$$, 0, 'no notices without two-factor');
select test.expect($$select * from public.work_order_comments$$, 0, 'no comments without two-factor');
commit;

begin;
set local role anon;
select test.expect($$select * from public.notifications$$, -1, 'signed out cannot read notices');
select test.expect($$select * from public.work_order_comments$$, -1, 'signed out cannot read comments');
select test.expect($$select * from public.work_order_history$$, -1, 'signed out cannot read history');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","aal":"aal2"}';
select test.expect($$update public.actions set archived_at = now() where id = '00000000-0000-0000-0000-00000000f002'$$, -2, 'open work cannot be archived (cancel it instead)');
select test.expect($$update public.actions set status = 'done', done_at = now() where id = '00000000-0000-0000-0000-00000000f002'$$, 1, 'owner marks a work order done');
select test.expect($$update public.actions set archived_at = '2020-01-01' where id = '00000000-0000-0000-0000-00000000f002'$$, 1, 'owner archives finished work');
select test.expect($$select * from public.actions where id = '00000000-0000-0000-0000-00000000f002' and archived_at > now() - interval '1 minute'$$, 1, 'the archive time is stamped by the database, not typed');
select test.expect($$update public.actions set archived_at = null where id = '00000000-0000-0000-0000-00000000f002'$$, 1, 'owner can un-archive');
select test.expect($$delete from public.work_order_history$$, -1, 'even the owner cannot delete history');
select test.expect($$update public.work_order_history set new_value = 'x'$$, -1, 'even the owner cannot edit history');
select test.expect($$delete from public.notifications$$, -1, 'notices are never deleted');
select test.expect($$delete from public.actions where id = '00000000-0000-0000-0000-00000000f002'$$, 0, 'even the owner cannot delete work orders outside Trash (nothing deleted)');
commit;

select test.expect($$select * from public.work_order_history where action_id = '00000000-0000-0000-0000-00000000f002' and field = 'archived'$$, 2, 'history records archive and un-archive');

-- ---------------------------------------------------------------------------
-- 7o. Bot runs (0018): random run codes, start times, unknown cost only on failures.
-- ---------------------------------------------------------------------------
select test.expect($$select * from public.ai_usage where run_ref is null or run_ref !~ '^[0-9a-f]{12}$'$$, 0, 'every logged run (old ones too) has a random 12-character code');
select test.expect($$select run_ref from public.ai_usage group by run_ref having count(*) > 1$$, 0, 'run codes are unique');

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","aal":"aal2"}';
select test.expect($$insert into public.ai_usage (feature, model, input_tokens, output_tokens, cost_usd, outcome, started_at, run_ref) values ('briefing', 'm', 1, 1, 0.01, 'ok', now() - interval '5 seconds', 'aaaaaaaaaaaa')$$, 1, 'manager logs a run with its start time');
select test.expect($$select * from public.ai_usage where run_ref = 'aaaaaaaaaaaa'$$, 0, 'the app cannot choose the run code (the database sets it)');
select test.expect($$insert into public.ai_usage (feature, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd, outcome) values ('quick_add', 'm', null, null, null, null, null, 'error')$$, 1, 'a failed run with no bill is logged with a blank cost');
select test.expect($$select * from public.ai_usage where feature = 'quick_add' and outcome = 'error' and cost_usd is null$$, 1, 'the blank cost stays blank (not 0)');
select test.expect($$insert into public.ai_usage (feature, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd, outcome) values ('briefing', 'm', null, null, null, null, null, 'ok')$$, -2, 'a run that worked must have its cost');
select test.expect($$insert into public.ai_usage (feature, model, input_tokens, output_tokens, cost_usd, outcome) values ('briefing', 'm', 1, 1, null, 'error')$$, -2, 'a blank cost needs blank token counts too');
select test.expect($$insert into public.ai_usage (feature, model, input_tokens, output_tokens, cost_usd, outcome, started_at) values ('briefing', 'm', 1, 1, 0.01, 'ok', now() + interval '1 day')$$, -2, 'a start time in the future is rejected');
select test.expect($$insert into public.ai_usage (feature, model, input_tokens, output_tokens, cost_usd, outcome, started_at) values ('briefing', 'm', 1, 1, 0.01, 'ok', now() - interval '2 days')$$, -2, 'a start time long before the run is rejected');
select test.expect($$update public.ai_usage set run_ref = 'bbbbbbbbbbbb'$$, -1, 'run codes cannot be changed');
select test.expect($$update public.ai_usage set started_at = now()$$, -1, 'start times cannot be changed');
select test.expect($$delete from public.ai_usage$$, -1, 'runs cannot be deleted');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","aal":"aal2"}';
select test.expect('select run_ref, started_at from public.ai_usage', 0, 'developer cannot read bot runs');
select test.expect($$insert into public.ai_usage (feature, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd, outcome) values ('briefing', 'm', null, null, null, null, null, 'error')$$, -1, 'developer cannot log runs, even failed ones');
commit;

-- ---------------------------------------------------------------------------
-- 7p. Trash (0019): owner + managers trash/restore; ONLY the owner deletes, ONLY from
--     Trash; developers never see trashed work; deletions leave a name-free record.
-- ---------------------------------------------------------------------------
insert into public.clients (id, slug, name, monthly_usd, start_date, status, services) values
  ('00000000-0000-0000-0000-000000007c09', 'trash-test', 'Trash Test (fictional)', 100, '2026-01-05', 'active', '{SEO}'),
  ('00000000-0000-0000-0000-000000007c08', 'keep-test', 'Keep Test (fictional)', 100, '2026-01-05', 'active', '{SEO}'),
  ('00000000-0000-0000-0000-000000007c07', 'billing-test', 'Billing Test (fictional)', 100, '2026-01-05', 'active', '{SEO}');
insert into public.billing_contact_matches (provider_contact_id, client_id, matched_by)
  values ('trashtest01', '00000000-0000-0000-0000-000000007c07', '00000000-0000-0000-0000-0000000000a1');

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","aal":"aal2"}';
select test.expect($$insert into public.actions (id, client_id, kind, title, owner_staff_id, created_by) values ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-000000007c09', 'work_order', 'Old page (test)', '00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000a2')$$, 1, 'trash setup: a work order for developer 1');
select test.expect($$insert into public.actions (id, client_id, kind, title, owner_staff_id, created_by) values ('00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-000000007c09', 'follow_up', 'Old follow-up (test)', '00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000a2')$$, 1, 'trash setup: a follow-up for developer 1');
select test.expect($$insert into public.actions (id, client_id, kind, title, created_by) values ('00000000-0000-0000-0000-00000000e003', '00000000-0000-0000-0000-000000007c08', 'work_order', 'Duplicate (test)', '00000000-0000-0000-0000-0000000000a2')$$, 1, 'trash setup: a duplicate work order');
select test.expect($$insert into public.check_ins (client_id, happened_on) values ('00000000-0000-0000-0000-000000007c09', '2026-11-01')$$, 1, 'trash setup: a check-in');
select test.expect($$insert into public.work_order_comments (action_id, body) values ('00000000-0000-0000-0000-00000000e001', 'Old note (test)')$$, 1, 'trash setup: a comment');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","aal":"aal2"}';
select test.expect($$select * from public.my_work where id = '00000000-0000-0000-0000-00000000e001'$$, 1, 'developer sees their work order before it is trashed');
select test.expect($$update public.actions set trashed_at = now() where id = '00000000-0000-0000-0000-00000000e001'$$, -1, 'developer cannot move things to Trash');
select test.expect($$delete from public.actions where id = '00000000-0000-0000-0000-00000000e001'$$, 0, 'developer cannot delete their work order');
select test.expect('select * from public.deletion_log', 0, 'developer cannot read the deletion record');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","aal":"aal2"}';
select test.expect($$update public.actions set trashed_at = '2020-01-01' where id = '00000000-0000-0000-0000-00000000e001'$$, 1, 'manager moves a work order to Trash');
select test.expect($$select * from public.actions where id = '00000000-0000-0000-0000-00000000e001' and trashed_at > now() - interval '1 minute' and trashed_by = '00000000-0000-0000-0000-0000000000a2'$$, 1, 'the database stamps when and who (not the app)');
select test.expect($$update public.actions set trashed_by = '00000000-0000-0000-0000-0000000000a1' where id = '00000000-0000-0000-0000-00000000e001'$$, -1, 'who trashed it cannot be faked');
select test.expect($$update public.clients set trashed_at = now() where id = '00000000-0000-0000-0000-000000007c09'$$, 1, 'manager moves a client to Trash');
select test.expect($$update public.clients set trashed_at = now(), services = '{Ads}' where id = '00000000-0000-0000-0000-000000007c08'$$, -1, 'manager cannot sneak other client changes in with Trash');
select test.expect($$select id from public.clients where id = '00000000-0000-0000-0000-000000007c08' and trashed_at is null and services = '{SEO}'$$, 1, 'that client is untouched');
select test.expect($$update public.clients set trashed_at = now() where id = '00000000-0000-0000-0000-000000007c07'$$, -2, 'a client with billing records cannot go to Trash');
select test.expect($$delete from public.actions where id = '00000000-0000-0000-0000-00000000e001'$$, 0, 'manager cannot delete forever, even from Trash');
select test.expect($$delete from public.clients where id = '00000000-0000-0000-0000-000000007c09'$$, 0, 'manager cannot delete a client forever, even from Trash');
select test.expect('select * from public.deletion_log', 0, 'manager cannot read the deletion record');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","aal":"aal2"}';
select test.expect($$select * from public.actions where id in ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-00000000e002')$$, 0, 'developer never sees trashed work, or work of a trashed client');
select test.expect($$select * from public.my_work where id in ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-00000000e002')$$, 0, 'trashed work leaves the developer''s list');
select test.expect($$select * from public.my_client_contacts where client_slug = 'trash-test'$$, 0, 'a trashed client leaves the developer''s contacts');
select test.expect($$select * from public.work_order_comments where action_id = '00000000-0000-0000-0000-00000000e001'$$, 0, 'comments of trashed work are hidden from developers');
select test.expect($$select * from public.work_order_history where action_id = '00000000-0000-0000-0000-00000000e001'$$, 0, 'history of trashed work is hidden from developers');
select test.expect($$update public.actions set status = 'in_progress' where id = '00000000-0000-0000-0000-00000000e002'$$, 0, 'developer cannot change work of a trashed client');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","aal":"aal2"}';
select test.expect($$update public.clients set trashed_at = null where id = '00000000-0000-0000-0000-000000007c09'$$, 1, 'manager restores a client');
select test.expect($$select id from public.clients where id = '00000000-0000-0000-0000-000000007c09' and trashed_by is null$$, 1, 'restoring clears who trashed it');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","aal":"aal2"}';
select test.expect($$select * from public.actions where id = '00000000-0000-0000-0000-00000000e002'$$, 1, 'restoring the client brings its work back');
select test.expect($$select * from public.actions where id = '00000000-0000-0000-0000-00000000e001'$$, 0, 'an item trashed on its own stays in Trash');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","aal":"aal2"}';
select test.expect($$update public.clients set trashed_at = now() where id = '00000000-0000-0000-0000-000000007c09'$$, 1, 'owner moves the client to Trash again');
select test.expect($$delete from public.actions where id = '00000000-0000-0000-0000-00000000e003'$$, 0, 'owner cannot delete what is not in Trash');
select test.expect($$update public.actions set trashed_at = now() where id = '00000000-0000-0000-0000-00000000e003'$$, 1, 'owner trashes the duplicate');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","aal":"aal1"}';
select test.expect($$delete from public.actions where id = '00000000-0000-0000-0000-00000000e003'$$, 0, 'owner without two-factor cannot delete');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","aal":"aal2"}';
select test.expect($$delete from public.actions where id = '00000000-0000-0000-0000-00000000e003'$$, 1, 'owner deletes a trashed work order forever');
select test.expect($$delete from public.clients where id = '00000000-0000-0000-0000-000000007c09'$$, 1, 'owner deletes a trashed client forever');
select test.expect('select * from public.deletion_log', 4, 'owner reads the deletion record');
commit;

-- Everything attached went with it; nothing else was touched.
select test.expect($$select id from public.clients where id = '00000000-0000-0000-0000-000000007c09'$$, 0, 'the client is gone');
select test.expect($$select * from public.check_ins where client_id = '00000000-0000-0000-0000-000000007c09'$$, 0, 'its check-ins went with it');
select test.expect($$select * from public.actions where client_id = '00000000-0000-0000-0000-000000007c09'$$, 0, 'its work went with it');
select test.expect($$select * from public.work_order_comments where action_id = '00000000-0000-0000-0000-00000000e001'$$, 0, 'comments went with it');
select test.expect($$select * from public.work_order_history where action_id in ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-00000000e003')$$, 0, 'history went with it');
select test.expect($$select id from public.clients where id in ('00000000-0000-0000-0000-000000007c08', '00000000-0000-0000-0000-000000007c07')$$, 2, 'other clients are untouched');
select test.expect($$select * from public.deletion_log where kind = 'client' and not with_client$$, 1, 'record: one client');
select test.expect($$select * from public.deletion_log where kind in ('work_order', 'follow_up') and with_client$$, 2, 'record: its two items, marked as deleted with the client');
select test.expect($$select * from public.deletion_log where kind = 'work_order' and not with_client$$, 1, 'record: the duplicate deleted on its own');
select test.expect($$select column_name from information_schema.columns where table_schema = 'public' and table_name = 'deletion_log' and column_name not in ('id', 'deleted_at', 'deleted_by', 'kind', 'with_client')$$, 0, 'the deletion record has no room for names or contents');

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","aal":"aal2"}';
select test.expect($$insert into public.deletion_log (kind) values ('client')$$, -1, 'nobody can write the deletion record by hand');
select test.expect($$delete from public.deletion_log$$, -1, 'nobody can erase the deletion record');
select test.expect($$delete from public.billing_contact_matches$$, -1, 'billing matches still cannot be deleted');
commit;

-- ---------------------------------------------------------------------------
-- 7q. Sales role (0020): sees ONLY open sales-pipeline leads, GHL user names, the pipeline
--     list, reach-outs, their own target and lead follow-ups. Nothing else, anywhere.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a6', 'sales1@example.com'),
  ('00000000-0000-0000-0000-0000000000a7', 'sales2@example.com');
insert into public.team_members (user_id, display_name, role, ghl_user_id) values
  ('00000000-0000-0000-0000-0000000000a6', 'Sales 1 (test)', 'sales', 'ghluser01'),
  ('00000000-0000-0000-0000-0000000000a7', 'Sales 2 (test)', 'sales', 'ghluser02');
select test.expect($$insert into public.team_members (user_id, display_name, role) values ('00000000-0000-0000-0000-0000000000a4', 'X', 'admin')$$, -2, 'unknown roles are still rejected');
insert into public.ghl_opportunities (ghl_id, name, status, monetary_value, pipeline_id, assigned_user_id) values
  ('slead1', 'Sample Plumbing (fictional)', 'open', 1200, 'pipeSales', 'ghluser01'),
  ('slead2', 'Sample Bakery (fictional)', 'open', 800, 'pipeSales', 'ghluser02'),
  ('slead3', 'Sample Gym (fictional)', 'lost', 900, 'pipeSales', 'ghluser01'),
  ('olead1', 'Sample Website Build (fictional)', 'open', 3000, 'pipeDev', 'ghluser01');
insert into public.ghl_users (ghl_user_id, name) values ('ghluser01', 'Sales One (test)'), ('ghluser02', 'Sales Two (test)');
select test.expect($$insert into public.ghl_users (ghl_user_id, name) values ('ghluser03', 'pat@example.com')$$, -2, 'GoHighLevel user names refuse email addresses');

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a6","aal":"aal2"}';
select test.expect('select * from public.ghl_opportunities', 0, 'before the owner picks sales pipelines, sales sees no leads');
select test.expect($$insert into public.sales_pipelines (pipeline_id, pipeline_name) values ('pipeSales', 'Sales (test)')$$, -1, 'sales cannot pick the sales pipelines');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","aal":"aal2"}';
select test.expect($$insert into public.sales_pipelines (pipeline_id, pipeline_name) values ('pipeDev', 'Dev (test)')$$, -1, 'managers cannot pick the sales pipelines');
select test.expect($$insert into public.sales_targets (user_id, daily_target) values ('00000000-0000-0000-0000-0000000000a6', 50)$$, -1, 'managers cannot set targets');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","aal":"aal2"}';
select test.expect($$insert into public.sales_pipelines (pipeline_id, pipeline_name, hot_stages) values ('pipeSales', 'Sales (test)', '{Proposal sent}')$$, 1, 'owner picks a sales pipeline');
select test.expect($$insert into public.sales_targets (user_id) values ('00000000-0000-0000-0000-0000000000a6')$$, 1, 'owner sets a target');
select test.expect($$select * from public.sales_targets where daily_target = 15$$, 1, 'the default target is 15');
select test.expect($$insert into public.sales_targets (user_id, daily_target) values ('00000000-0000-0000-0000-0000000000a7', 500)$$, -2, 'absurd targets are rejected');
select test.expect($$insert into public.sales_targets (user_id, daily_target) values ('00000000-0000-0000-0000-0000000000a7', 20)$$, 1, 'owner sets a second target');
select test.expect($$update public.team_members set ghl_user_id = 'ghluser09' where user_id = '00000000-0000-0000-0000-0000000000a7'$$, 1, 'owner links a login to a GoHighLevel user');
select test.expect($$update public.team_members set role = 'owner' where user_id = '00000000-0000-0000-0000-0000000000a7'$$, -1, 'roles still cannot be changed through the app');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a6","aal":"aal2"}';
select test.expect('select * from public.ghl_opportunities', 2, 'sales sees the open leads of sales pipelines (both salespeople''s)');
select test.expect($$select * from public.ghl_opportunities where ghl_id in ('slead3', 'olead1', 'opp1')$$, 0, 'sales never sees other pipelines or closed leads');
select test.expect('select * from public.ghl_users', 2, 'sales sees GoHighLevel user names');
select test.expect('select * from public.sales_pipelines', 1, 'sales sees which pipelines count');
select test.expect('select * from public.sales_targets', 1, 'sales sees only their own target');
select test.expect('select * from public.team_members', 1, 'sales sees only their own team row');
select test.expect($$update public.team_members set ghl_user_id = 'ghluser02'$$, 0, 'sales cannot relink logins');
select test.expect($$update public.sales_targets set daily_target = 1$$, 0, 'sales cannot change their target');
-- Reach-outs
select test.expect($$insert into public.lead_touches (lead_ghl_id, kind, note, touched_at) values ('slead1', 'call', 'Left a voicemail (test)', '2020-01-01')$$, 1, 'sales logs a reach-out');
select test.expect($$select * from public.lead_touches where touched_at > now() - interval '1 minute' and touched_by = '00000000-0000-0000-0000-0000000000a6'$$, 1, 'the database stamps who and when');
select test.expect($$insert into public.lead_touches (lead_ghl_id, kind) values ('slead2', 'walk_in')$$, 1, 'sales logs a walk-in on a teammate''s lead');
select test.expect($$insert into public.lead_touches (lead_ghl_id, kind) values ('olead1', 'call')$$, -1, 'sales cannot log on leads outside sales pipelines');
select test.expect($$insert into public.lead_touches (lead_ghl_id, kind, touched_by) values ('slead1', 'call', '00000000-0000-0000-0000-0000000000a7')$$, -1, 'sales cannot log a reach-out as someone else');
select test.expect($$insert into public.lead_touches (lead_ghl_id, kind, note) values ('slead1', 'text', 'Their cell is 555-010-1234')$$, -2, 'reach-out notes refuse phone numbers');
select test.expect($$insert into public.lead_touches (lead_ghl_id, kind, note) values ('slead1', 'email', 'wrote to pat@example.com')$$, -2, 'reach-out notes refuse email addresses');
select test.expect($$update public.lead_touches set kind = 'meeting'$$, -1, 'reach-outs cannot be edited');
select test.expect($$delete from public.lead_touches$$, -1, 'reach-outs cannot be deleted');
-- Lead follow-ups only
select test.expect($$insert into public.actions (lead_ghl_id, kind, title, created_by) values ('slead1', 'follow_up', 'Call back Tuesday (test)', '00000000-0000-0000-0000-0000000000a6')$$, 1, 'sales adds a lead follow-up');
select test.expect($$update public.actions set status = 'done', done_at = now() where lead_ghl_id = 'slead1'$$, 1, 'sales ticks their lead follow-up done');
select test.expect($$insert into public.actions (client_id, kind, title, created_by) values ('00000000-0000-0000-0000-0000000000c1', 'follow_up', 'X', '00000000-0000-0000-0000-0000000000a6')$$, -1, 'sales cannot add client follow-ups');
select test.expect($$insert into public.actions (lead_ghl_id, kind, title, created_by) values ('slead1', 'work_order', 'X', '00000000-0000-0000-0000-0000000000a6')$$, -1, 'sales cannot add work orders');
select test.expect($$select * from public.actions where lead_ghl_id is null$$, 0, 'sales never sees client items or work orders');
select test.expect($$update public.actions set title = 'x' where lead_ghl_id is null$$, 0, 'sales cannot change client items');
select test.expect($$update public.actions set trashed_at = now() where lead_ghl_id = 'slead1'$$, -1, 'sales cannot move things to Trash');
select test.expect($$delete from public.actions$$, 0, 'sales cannot delete anything');
-- Refresh leads: sales-pipeline copies only, at most every 10 minutes
select test.expect($$insert into public.lead_refreshes (leads) values (2)$$, 1, 'sales refreshes leads');
select test.expect($$insert into public.lead_refreshes (leads) values (2)$$, -2, 'a second refresh within 10 minutes is refused');
select test.expect($$update public.ghl_opportunities set stage_name = 'Proposal sent' where ghl_id = 'slead1'$$, 1, 'a refresh may update a sales-pipeline lead');
select test.expect($$insert into public.ghl_opportunities (ghl_id, name, status, pipeline_id) values ('slead4', 'Sample Cafe (fictional)', 'open', 'pipeSales')$$, 1, 'a refresh may add a sales-pipeline lead');
select test.expect($$insert into public.ghl_opportunities (ghl_id, name, status, pipeline_id) values ('olead2', 'X', 'open', 'pipeDev')$$, -1, 'a refresh cannot add leads of other pipelines');
select test.expect($$update public.ghl_opportunities set pipeline_id = 'pipeDev' where ghl_id = 'slead4'$$, -1, 'a refresh cannot move a lead out of sales');
-- How the app's "Refresh leads" writes for a salesperson (src/app/actions.ts runLeadRefresh):
select test.expect($$insert into public.ghl_opportunities (ghl_id, name, status, pipeline_id) values ('slead4', 'Sample Cafe (fictional)', 'open', 'pipeSales') on conflict (ghl_id) do update set name = excluded.name, status = excluded.status$$, 1, 'a sales refresh may update an open lead it can see');
select test.expect($$insert into public.ghl_opportunities (ghl_id, name, status, pipeline_id) values ('slead4', 'Sample Cafe (fictional)', 'won', 'pipeSales') on conflict (ghl_id) do update set name = excluded.name, status = excluded.status$$, -1, 'a sales refresh cannot mark a lead won (owner/manager refresh does)');
select test.expect($$update public.ghl_opportunities set status = 'won' where ghl_id = 'slead4'$$, -1, 'sales cannot close a lead');
select test.expect($$insert into public.ghl_opportunities (ghl_id, name, status, pipeline_id) values ('slead3', 'X', 'open', 'pipeSales') on conflict (ghl_id) do nothing$$, 0, 'a sales refresh skips leads hidden from sales (closed copies stay as they are)');
select test.expect($$select * from public.ghl_opportunities where ghl_id = 'slead3'$$, 0, 'the closed copy is still hidden from sales');
select test.expect($$insert into public.ghl_opportunities (ghl_id, name, status, pipeline_id) values ('slead5', 'Sample Bakery (fictional)', 'open', 'pipeSales') on conflict (ghl_id) do nothing$$, 1, 'a sales refresh may add a new open lead');
select test.expect($$insert into public.ghl_appointments (ghl_id, calendar_name) values ('apptX', 'X')$$, -1, 'sales cannot write other GoHighLevel copies');
select test.expect($$insert into public.sales_pipelines (pipeline_id) values ('pipeDev')$$, -1, 'sales cannot add pipelines');
-- Kit pages for sales only
select test.expect('select * from public.kit_docs', 0, 'sales sees no Kit pages until one is meant for sales');
commit;

-- A manager's refresh records that a sales lead was won (salespeople's can't).
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","aal":"aal2"}';
select test.expect($$insert into public.ghl_opportunities (ghl_id, name, status, pipeline_id) values ('slead4', 'Sample Cafe (fictional)', 'won', 'pipeSales') on conflict (ghl_id) do update set name = excluded.name, status = excluded.status$$, 1, 'a manager refresh marks a sales lead won');
select test.expect($$insert into public.ghl_opportunities (ghl_id, name, status, pipeline_id) values ('olead1', 'X', 'won', 'pipeDev') on conflict (ghl_id) do update set status = excluded.status$$, -1, 'a manager refresh cannot write other pipelines');
commit;

-- Kit: a page meant for sales.
insert into public.kit_docs (kind, title, category, body, audience, updated_by)
  values ('sop', 'Cold call script (sample)', 'Sales', 'Say hello. (sample)', '{sales}', '00000000-0000-0000-0000-0000000000a1');
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a6","aal":"aal2"}';
select test.expect('select * from public.kit_docs', 1, 'sales sees Kit pages meant for sales');
commit;
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","aal":"aal2"}';
select test.expect($$select * from public.kit_docs where 'sales' = any (audience) and not ('developer' = any (audience))$$, 0, 'developers do not see sales-only Kit pages');
select test.expect('select * from public.ghl_opportunities', 0, 'developers still see no leads');
select test.expect('select * from public.lead_touches', 0, 'developers see no reach-outs');
select test.expect('select * from public.ghl_users', 0, 'developers see no GoHighLevel users');
select test.expect('select * from public.sales_targets', 0, 'developers see no targets');
commit;
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a6","aal":"aal1"}';
select test.expect('select * from public.ghl_opportunities', 0, 'sales without two-factor sees no leads');
commit;

-- The whole database: a salesperson reads ZERO rows from every table and view except the
-- ones the plan allows. Counts as the admin first, so the check proves something.
create temp table sales_scope_check as
  select c.relname as name, 0::bigint as admin_rows
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'v')
    and c.relname not in ('ghl_opportunities', 'ghl_users', 'sales_pipelines', 'lead_touches',
                          'sales_targets', 'lead_refreshes', 'actions', 'team_members', 'kit_docs',
                          -- 0023: one settings row salespeople read on purpose (caps + plan prices);
                          -- tested explicitly in 7t. audits / audit_spend / audit_user_limits stay
                          -- in this check AND get own-rows-only checks in 7t.
                          'audit_settings',
                          -- 0024: one settings row salespeople read on purpose (their Scout cap);
                          -- tested explicitly in 7u. Every other scout_ table stays in this check
                          -- AND gets own-rows / shared-pool checks in 7u.
                          'scout_settings',
                          -- 0026: the leaderboard view (names + totals only) is meant for
                          -- salespeople; tested explicitly in 7w.
                          'sales_leaderboard');
do $$
declare r record; n bigint;
begin
  for r in select name from sales_scope_check loop
    execute format('select count(*) from public.%I', r.name) into n;
    update sales_scope_check set admin_rows = n where name = r.name;
  end loop;
end;
$$;
grant select on sales_scope_check to authenticated;
select test.expect('select * from sales_scope_check where admin_rows > 0', (select count(*) from sales_scope_check where admin_rows > 0), 'sanity: the scope check covers tables that hold data');
do $$
begin
  if (select count(*) from sales_scope_check where admin_rows > 0) < 20 then
    raise exception 'FAILED: the sales scope check should cover at least 20 tables with data';
  end if;
  raise notice 'ok: the sales scope check covers % tables with data', (select count(*) from sales_scope_check where admin_rows > 0);
end;
$$;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a6","aal":"aal2"}';
do $$
declare r record; n bigint; bad text := '';
begin
  for r in select name from sales_scope_check loop
    begin
      execute format('select count(*) from public.%I', r.name) into n;
    exception when insufficient_privilege then n := 0;
    end;
    if n > 0 then bad := bad || r.name || ' (' || n || ') '; end if;
  end loop;
  if bad <> '' then raise exception 'FAILED: a salesperson can read: %', bad; end if;
  raise notice 'ok: a salesperson reads nothing from every other table and view';
end;
$$;
commit;

-- ---------------------------------------------------------------------------
-- 7r. Fix titles and check-ins (0021): owner + managers edit or remove check-ins (never
--     delete); only the owner restores; every change is kept by the database only;
--     developers and salespeople can't touch any of it; work orders record title changes.
-- ---------------------------------------------------------------------------
insert into public.clients (id, slug, name, monthly_usd, start_date, status, services, owner_staff_id) values
  ('00000000-0000-0000-0000-000000007c0a', 'edit-test', 'Edit Test (fictional)', 100, '2026-01-05', 'active', '{SEO}', '00000000-0000-0000-0000-0000000000b3');
insert into public.check_ins (id, client_id, happened_on, note, logged_by) values
  ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-000000007c0a', '2026-11-03', 'Wrong date (test)', '00000000-0000-0000-0000-0000000000a2'),
  ('00000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-000000007c0a', '2026-11-10', 'Logged on the wrong client (test)', '00000000-0000-0000-0000-0000000000a2');
insert into public.actions (id, client_id, kind, title, owner_staff_id, created_by) values
  ('00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-000000007c0a', 'work_order', 'Fix teh header (test)', '00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000a1');

-- Developer: no edits, no removal, no change record; title stays locked.
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","aal":"aal2"}';
select test.expect($$select * from public.my_client_contacts where client_slug = 'edit-test' and last_logged_on = '2026-11-10'$$, 1, 'developer sees the latest contact date before removal');
select test.expect($$update public.check_ins set note = 'x' where id = '00000000-0000-0000-0000-00000000f001'$$, 0, 'developer cannot edit a check-in');
select test.expect($$update public.check_ins set removed_at = now() where id = '00000000-0000-0000-0000-00000000f002'$$, 0, 'developer cannot remove a check-in');
select test.expect('select * from public.check_in_edits', 0, 'developer cannot read the check-in change record');
select test.expect($$update public.actions set title = 'Renamed (test)' where id = '00000000-0000-0000-0000-00000000f101'$$, -1, 'developer still cannot rename their work order');
commit;

-- Salesperson: same.
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a6","aal":"aal2"}';
select test.expect($$update public.check_ins set note = 'x' where id = '00000000-0000-0000-0000-00000000f001'$$, 0, 'salesperson cannot edit a check-in');
select test.expect('select * from public.check_in_edits', 0, 'salesperson cannot read the check-in change record');
commit;

-- Manager: fixes the date and note; can't move it to another client or fake who logged it.
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","aal":"aal2"}';
select test.expect($$update public.check_ins set happened_on = '2026-11-04', note = 'Right date (test)', mood = 'better', kind = 'call' where id = '00000000-0000-0000-0000-00000000f001'$$, 1, 'manager fixes a check-in''s date, note, mood and type');
select test.expect($$select * from public.check_ins where id = '00000000-0000-0000-0000-00000000f001' and edited_by = '00000000-0000-0000-0000-0000000000a2' and edited_at > now() - interval '1 minute'$$, 1, 'the database stamps who edited it and when');
select test.expect($$select * from public.check_in_edits where check_in_id = '00000000-0000-0000-0000-00000000f001' and change = 'edited' and old_happened_on = '2026-11-03' and new_happened_on = '2026-11-04' and old_note = 'Wrong date (test)' and old_kind = 'check_in' and new_kind = 'call' and actor = '00000000-0000-0000-0000-0000000000a2'$$, 1, 'the old and new values are kept');
select test.expect($$update public.check_ins set client_id = '00000000-0000-0000-0000-000000007c08' where id = '00000000-0000-0000-0000-00000000f001'$$, -1, 'a check-in cannot be moved to another client');
select test.expect($$update public.check_ins set logged_by = '00000000-0000-0000-0000-0000000000a1' where id = '00000000-0000-0000-0000-00000000f001'$$, -1, 'who logged it cannot be changed');
select test.expect($$update public.check_ins set edited_by = '00000000-0000-0000-0000-0000000000a1' where id = '00000000-0000-0000-0000-00000000f001'$$, -1, 'who edited it cannot be faked');
select test.expect($$update public.check_ins set happened_on = current_date + 30 where id = '00000000-0000-0000-0000-00000000f001'$$, -2, 'a check-in date cannot be in the future');
select test.expect($$delete from public.check_ins where id = '00000000-0000-0000-0000-00000000f001'$$, -1, 'check-ins can never be deleted from the app');
select test.expect($$insert into public.check_in_edits (check_in_id, change) values ('00000000-0000-0000-0000-00000000f001', 'edited')$$, -1, 'nobody can write the change record by hand');
select test.expect($$update public.check_in_edits set old_note = 'x'$$, -1, 'nobody can rewrite the change record');
select test.expect($$delete from public.check_in_edits$$, -1, 'nobody can erase the change record');
select test.expect($$update public.check_ins set removed_at = '2020-01-01' where id = '00000000-0000-0000-0000-00000000f002'$$, 1, 'manager removes a check-in (hidden, not deleted)');
select test.expect($$select * from public.check_ins where id = '00000000-0000-0000-0000-00000000f002' and removed_at > now() - interval '1 minute' and removed_by = '00000000-0000-0000-0000-0000000000a2'$$, 1, 'the database stamps who removed it and when');
select test.expect($$update public.check_ins set note = 'sneaky (test)' where id = '00000000-0000-0000-0000-00000000f002'$$, -2, 'a removed check-in cannot be changed until restored');
select test.expect($$update public.check_ins set removed_at = null where id = '00000000-0000-0000-0000-00000000f002'$$, -1, 'only the owner restores a removed check-in');
select test.expect($$update public.actions set title = 'Fix the header (test)' where id = '00000000-0000-0000-0000-00000000f101'$$, 1, 'manager fixes a work order title');
select test.expect($$select * from public.work_order_history where action_id = '00000000-0000-0000-0000-00000000f101' and field = 'title' and old_value = 'Fix teh header (test)' and new_value = 'Fix the header (test)' and actor_name = 'Manager (test)'$$, 1, 'the title change is in the work order history');
select test.expect($$insert into public.activity (client_id, action_id, kind, summary) values ('00000000-0000-0000-0000-000000007c0a', '00000000-0000-0000-0000-00000000f101', 'action_edited', 'Renamed: Fix teh header (test) → Fix the header (test)')$$, 1, 'the rename goes on the client timeline');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","aal":"aal2"}';
select test.expect($$select * from public.my_client_contacts where client_slug = 'edit-test' and last_logged_on = '2026-11-04'$$, 1, 'a removed check-in leaves the developer''s contact dates');
select test.expect($$select * from public.work_order_history where action_id = '00000000-0000-0000-0000-00000000f101' and field = 'title'$$, 1, 'the developer sees the title change on their work order');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","aal":"aal1"}';
select test.expect($$update public.check_ins set removed_at = null where id = '00000000-0000-0000-0000-00000000f002'$$, 0, 'owner without two-factor cannot restore');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","aal":"aal2"}';
select test.expect($$update public.check_ins set removed_at = null where id = '00000000-0000-0000-0000-00000000f002'$$, 1, 'owner restores a removed check-in');
select test.expect($$select * from public.check_ins where id = '00000000-0000-0000-0000-00000000f002' and removed_at is null and removed_by is null$$, 1, 'restoring clears the removal');
select test.expect($$select * from public.check_in_edits where check_in_id = '00000000-0000-0000-0000-00000000f002' order by at$$, 2, 'removal and restore are both kept');
select test.expect($$update public.check_ins set removed_at = now(), note = 'both (test)' where id = '00000000-0000-0000-0000-00000000f002'$$, -2, 'remove is a change on its own');
commit;

-- ---------------------------------------------------------------------------
-- 7s. Internal work orders (0022): "our agency" work has no client and no lead. Only work
--     orders can be internal; the flag can't be changed later; developers see only their
--     own; salespeople see none.
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","aal":"aal2"}';
select test.expect($$insert into public.actions (id, internal, kind, title, owner_staff_id) values ('00000000-0000-0000-0000-00000000f201', true, 'work_order', 'Update our own website (test)', '00000000-0000-0000-0000-0000000000b3')$$, 1, 'manager adds an internal work order for a developer');
select test.expect($$insert into public.actions (id, internal, kind, title) values ('00000000-0000-0000-0000-00000000f202', true, 'work_order', 'Plan our newsletter (test)')$$, 1, 'manager adds an unassigned internal work order');
select test.expect($$insert into public.actions (internal, kind, title) values (true, 'follow_up', 'Internal follow-up (test)')$$, -2, 'only work orders can be internal');
select test.expect($$insert into public.actions (internal, client_id, kind, title) values (true, '00000000-0000-0000-0000-0000000000c1', 'work_order', 'Both (test)')$$, -2, 'an internal item cannot also have a client');
select test.expect($$insert into public.actions (kind, title) values ('work_order', 'Nothing (test)')$$, -2, 'an item still needs a client, a lead or internal');
select test.expect($$update public.actions set internal = false where id = '00000000-0000-0000-0000-00000000f201'$$, -1, 'internal cannot be changed afterwards');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","aal":"aal2"}';
select test.expect($$select * from public.my_work where id = '00000000-0000-0000-0000-00000000f201' and internal and client_name is null$$, 1, 'developer sees their internal work order in my_work');
select test.expect($$select * from public.my_work where id = '00000000-0000-0000-0000-00000000f202'$$, 0, 'developer does not see unassigned internal work');
select test.expect($$select * from public.actions where id = '00000000-0000-0000-0000-00000000f202'$$, 0, 'developer cannot read unassigned internal work directly');
select test.expect($$insert into public.actions (internal, kind, title) values (true, 'work_order', 'Dev adds (test)')$$, -1, 'developer cannot add internal work');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a6","aal":"aal2"}';
select test.expect($$select * from public.actions where internal$$, 0, 'salesperson sees no internal work');
select test.expect($$insert into public.actions (internal, kind, title) values (true, 'work_order', 'Sales adds (test)')$$, -1, 'salesperson cannot add internal work');
commit;

-- ---------------------------------------------------------------------------
-- 7t. Saved audits (0023): owner and managers read all; a salesperson reads only the
--     audits they made; developers read none. Never deleted. Spending caps are enforced
--     by the database itself.
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a6","aal":"aal2"}';
select test.expect('select * from public.audit_settings', 1, 'sales reads the one audit settings row (caps, plan prices)');
select test.expect($$insert into public.audits (id, title, sections, intake) values ('00000000-0000-0000-0000-00000000ad01', 'Sample Plumbing audit (fictional)', '{summary,heatmap}', '{"domain":"plumbing.example"}')$$, 1, 'sales saves an audit for a business typed in by hand');
select test.expect($$insert into public.audits (id, lead_ghl_id, title, intake) values ('00000000-0000-0000-0000-00000000ad02', 'slead1', 'Lead audit (fictional)', '{}')$$, 1, 'sales saves an audit tied to a sales lead');
select test.expect($$insert into public.audits (lead_ghl_id, title, intake) values ('olead1', 'X', '{}')$$, -1, 'sales cannot tie an audit to a lead outside the sales pipelines');
select test.expect($$insert into public.audits (lead_ghl_id, title, intake) values ('slead3', 'X', '{}')$$, -1, 'sales cannot tie an audit to a closed lead');
select test.expect($$insert into public.audits (title, intake, created_by) values ('X', '{}', '00000000-0000-0000-0000-0000000000a7')$$, -1, 'sales cannot save an audit as someone else');
select test.expect($$insert into public.audits (title, intake, archived_at) values ('X', '{}', now())$$, -1, 'an audit cannot start archived');
select test.expect($$insert into public.audits (title, sections, intake) values ('X', '{summary,hack}', '{}')$$, -2, 'unknown checkpoints are rejected');
select test.expect($$insert into public.audits (title, intake) values ('Call pat@example.com', '{}')$$, -2, 'audit titles refuse email addresses');
select test.expect($$insert into public.audits (title, intake) values ('X', '[1,2]')$$, -2, 'intake must be an object');
select test.expect($$insert into public.audits (title, kind, intake) values ('X', 'other', '{}')$$, -2, 'unknown audit kinds are rejected');
select test.expect($$update public.audits set title = 'Renamed (fictional)', sections = '{summary,competitors}' where id = '00000000-0000-0000-0000-00000000ad01'$$, 1, 'sales edits their own audit');
select test.expect($$update public.audits set archived_at = now() where id = '00000000-0000-0000-0000-00000000ad01'$$, -1, 'sales cannot archive an audit');
select test.expect($$update public.audits set created_by = '00000000-0000-0000-0000-0000000000a7'$$, -1, 'nobody can change who made an audit');
select test.expect($$update public.audits set lead_ghl_id = 'olead1'$$, -1, 'the lead on an audit cannot be changed');
select test.expect($$delete from public.audits$$, -1, 'sales cannot delete audits');
select test.expect($$update public.audit_settings set weekly_usd = 500$$, 0, 'sales cannot raise the caps');
select test.expect($$insert into public.audit_user_limits (user_id, weekly_usd) values ('00000000-0000-0000-0000-0000000000a6', 500)$$, -1, 'sales cannot set their own cap');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a7","aal":"aal2"}';
select test.expect('select * from public.audits', 0, 'a salesperson cannot read another salesperson''s audits');
select test.expect($$update public.audits set title = 'x'$$, 0, 'a salesperson cannot edit another salesperson''s audit');
select test.expect($$insert into public.audit_spend (audit_id, provider, usd) values ('00000000-0000-0000-0000-00000000ad01', 'dataforseo', 0.5)$$, -1, 'a salesperson cannot spend on someone else''s audit');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","aal":"aal2"}';
select test.expect('select * from public.audits', 2, 'owner reads every audit');
select test.expect($$insert into public.audits (id, title, intake) values ('00000000-0000-0000-0000-00000000ad03', 'Owner audit (fictional)', '{}')$$, 1, 'owner saves an audit');
select test.expect($$insert into public.audits (lead_ghl_id, title, intake) values ('olead1', 'Owner lead audit (fictional)', '{}')$$, 1, 'owner may tie an audit to any lead');
select test.expect($$insert into public.audits (id, title, intake) values ('00000000-0000-0000-0000-00000000ad04', 'Owner second audit (fictional)', '{}')$$, 1, 'owner saves a second audit');
select test.expect($$update public.audit_settings set weekly_usd = 1, per_audit_usd = 0.75, monthly_usd = 2, agency_name = 'Sample Agency (fictional)', updated_by = '00000000-0000-0000-0000-0000000000a1'$$, 1, 'owner sets the caps (small, for the tests below)');
select test.expect($$update public.audit_settings set per_audit_usd = 999, updated_by = '00000000-0000-0000-0000-0000000000a1'$$, -2, 'absurd per-audit caps are rejected');
select test.expect($$insert into public.audit_settings (id) values (true)$$, -1, 'there is only ever one settings row');
select test.expect($$insert into public.audit_user_limits (user_id, weekly_usd) values ('00000000-0000-0000-0000-0000000000a7', 3)$$, 1, 'owner sets a weekly cap for one salesperson');
select test.expect($$insert into public.audit_user_limits (user_id, weekly_usd) values ('00000000-0000-0000-0000-0000000000a1', 10)$$, 1, 'owner sets their own weekly cap (so the monthly test below is the one that bites)');
select test.expect($$delete from public.audits$$, -1, 'even the owner cannot delete audits');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","aal":"aal2"}';
select test.expect('select * from public.audits', 5, 'a manager reads every audit');
select test.expect($$update public.audit_settings set weekly_usd = 400, updated_by = '00000000-0000-0000-0000-0000000000a2'$$, 0, 'managers cannot change the caps');
select test.expect($$insert into public.audit_user_limits (user_id, weekly_usd) values ('00000000-0000-0000-0000-0000000000a6', 9)$$, -1, 'managers cannot set a salesperson''s cap');
select test.expect($$update public.audits set archived_at = now() where id = '00000000-0000-0000-0000-00000000ad03'$$, 1, 'a manager archives an audit');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a6","aal":"aal2"}';
-- Caps now: $0.75 per audit, $1 a week (this salesperson), $2 a month for everyone.
select test.expect($$insert into public.audit_spend (audit_id, provider, usd, at) values ('00000000-0000-0000-0000-00000000ad01', 'dataforseo', 0.5, '2020-01-01')$$, 1, 'sales records spend on their own audit (the database stamps the time)');
select test.expect($$select * from public.audit_spend where at > now() - interval '1 minute'$$, 1, 'a back-dated spend row is stamped with now');
select test.expect($$insert into public.audit_spend (audit_id, provider, usd) values ('00000000-0000-0000-0000-00000000ad01', 'dataforseo', 0.5)$$, -2, 'the per-audit cap stops a second pull on the same audit');
select test.expect($$insert into public.audit_spend (audit_id, provider, usd) values ('00000000-0000-0000-0000-00000000ad02', 'semrush', 0.6)$$, -2, 'the weekly cap stops spend past $1 this week');
select test.expect($$insert into public.audit_spend (audit_id, provider, usd) values ('00000000-0000-0000-0000-00000000ad02', 'semrush', 0.4)$$, 1, 'spend up to the weekly cap is allowed');
select test.expect($$insert into public.audit_spend (audit_id, provider, usd) values ('00000000-0000-0000-0000-00000000ad02', 'other', 0.1)$$, -2, 'unknown data providers are rejected');
select test.expect($$insert into public.audit_spend (audit_id, provider, usd, user_id) values ('00000000-0000-0000-0000-00000000ad02', 'dataforseo', 0.01, '00000000-0000-0000-0000-0000000000a7')$$, -1, 'sales cannot record spend as someone else');
select test.expect($$update public.audit_spend set usd = 0.01$$, -1, 'spend rows cannot be changed');
select test.expect($$delete from public.audit_spend$$, -1, 'spend rows cannot be deleted');
select test.expect('select * from public.audit_spend', 2, 'sales reads their own spend');
select test.expect('select * from public.audit_user_limits', 0, 'sales cannot read anyone else''s cap');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","aal":"aal2"}';
select test.expect($$insert into public.audit_spend (audit_id, provider, usd) values ('00000000-0000-0000-0000-00000000ad03', 'dataforseo', 0.5)$$, -1, 'nobody can spend on an archived audit');
select test.expect($$insert into public.audit_spend (audit_id, provider, usd) values ((select id from public.audits where lead_ghl_id = 'olead1'), 'dataforseo', 0.75)$$, 1, 'owner spends up to the per-audit cap');
select test.expect($$insert into public.audit_spend (audit_id, provider, usd) values ('00000000-0000-0000-0000-00000000ad04', 'dataforseo', 0.5)$$, -2, 'the monthly cap ($2) stops spend for everyone');
select test.expect('select * from public.audit_spend', 3, 'owner reads all spend');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","aal":"aal2"}';
select test.expect('select * from public.audits', 0, 'developers read no audits');
select test.expect('select * from public.audit_settings', 0, 'developers read no audit settings');
select test.expect('select * from public.audit_spend', 0, 'developers read no audit spend');
select test.expect('select * from public.audit_user_limits', 0, 'developers read no audit caps');
select test.expect($$insert into public.audits (title, intake) values ('X', '{}')$$, -1, 'developers cannot save audits');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a6","aal":"aal1"}';
select test.expect('select * from public.audits', 0, 'sales without two-factor reads no audits');
select test.expect($$insert into public.audits (title, intake) values ('X', '{}')$$, -1, 'sales without two-factor cannot save audits');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a4","aal":"aal2"}';
select test.expect('select * from public.audits', 0, 'someone not on the team reads no audits');
select test.expect('select * from public.audit_settings', 0, 'someone not on the team reads no audit settings');
commit;

-- ---------------------------------------------------------------------------
-- 7u. Scout (0024): runs, a capped spending ledger, prospects (own + shared pool, claim
--     for yourself only), an add-only visit log, do-not-contact. No phones or emails.
--     Caps: $10/month per salesperson, $25/month for everyone.
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a6","aal":"aal2"}';
select test.expect('select * from public.scout_settings', 1, 'sales reads the one Scout settings row (their cap)');
select test.expect($$insert into public.scout_runs (id, area, kinds, size, est_usd) values ('00000000-0000-0000-0000-0000000005c1', 'Austintown, OH, 30 mi', '{roofing contractor,plumber}', 100, 4.25)$$, 1, 'sales starts a Scout run');
select test.expect($$insert into public.scout_runs (area, kinds, size, est_usd, created_by) values ('X', '{plumber}', 10, 1, '00000000-0000-0000-0000-0000000000a7')$$, -1, 'sales cannot start a run as someone else');
select test.expect($$insert into public.scout_runs (area, kinds, size, est_usd) values ('call 330-555-0100', '{plumber}', 10, 1)$$, -2, 'run areas refuse phone numbers');
select test.expect($$insert into public.scout_runs (area, kinds, size, est_usd) values ('X', '{plumber}', 5000, 1)$$, -2, 'runs are at most 200 businesses');
select test.expect($$insert into public.scout_spend (run_id, provider, usd, at) values ('00000000-0000-0000-0000-0000000005c1', 'dataforseo', 4.25, '2020-01-01')$$, 1, 'sales records the run estimate before it runs');
select test.expect($$select * from public.scout_spend where at > now() - interval '1 minute'$$, 1, 'a back-dated Scout spend row is stamped with now');
select test.expect($$insert into public.scout_spend (run_id, provider, usd) values ('00000000-0000-0000-0000-0000000005c1', 'dataforseo', 6)$$, -2, 'the $10/month per-salesperson cap stops more');
select test.expect($$insert into public.scout_spend (run_id, provider, usd) values ('00000000-0000-0000-0000-0000000005c1', 'dataforseo', 5.75)$$, 1, 'spend up to the per-salesperson cap is allowed');
select test.expect($$insert into public.scout_spend (run_id, provider, usd) values ('00000000-0000-0000-0000-0000000005c1', 'other', 0.1)$$, -2, 'unknown Scout data providers are rejected');
select test.expect($$insert into public.scout_spend (run_id, provider, usd, user_id) values ('00000000-0000-0000-0000-0000000005c1', 'dataforseo', 0.01, '00000000-0000-0000-0000-0000000000a7')$$, -1, 'sales cannot record Scout spend as someone else');
select test.expect($$update public.scout_spend set usd = 0.01$$, -1, 'Scout spend rows cannot be changed');
select test.expect($$delete from public.scout_spend$$, -1, 'Scout spend rows cannot be deleted');
select test.expect($$insert into public.scout_prospects (id, run_id, business_key, name, town, score, angle, assigned_to, status, lat, lng) values ('00000000-0000-0000-0000-0000000005a1', '00000000-0000-0000-0000-0000000005c1', 'd:sample-roofing-a.example.com', 'Sample Roofing A (fictional)', 'Austintown', 80, 'ads', '00000000-0000-0000-0000-0000000000a6', 'won', 41.1, -80.7)$$, 1, 'sales saves a prospect from their own run, for themselves');
select test.expect($$select * from public.scout_prospects where status = 'new' and name_key = 'sampleroofingafictional'$$, 1, 'a new prospect always starts as new, and the database works out its name key');
select test.expect($$insert into public.scout_prospects (run_id, business_key, name, score, angle) values ('00000000-0000-0000-0000-0000000005c1', 'd:pool.example.com', 'Sample Pool Add (fictional)', 50, 'seo')$$, -1, 'sales cannot put prospects in the shared pool');
select test.expect($$insert into public.scout_prospects (run_id, business_key, name, score, angle, assigned_to) values ('00000000-0000-0000-0000-0000000005c1', 'd:x1.example.com', 'Call 330-555-0100', 50, 'seo', '00000000-0000-0000-0000-0000000000a6')$$, -2, 'prospect names refuse phone numbers');
select test.expect($$insert into public.scout_prospects (run_id, business_key, name, address, score, angle, assigned_to) values ('00000000-0000-0000-0000-0000000005c1', 'd:x2.example.com', 'Sample X (fictional)', 'pat@example.com', 50, 'seo', '00000000-0000-0000-0000-0000000000a6')$$, -2, 'prospect addresses refuse email addresses');
select test.expect($$insert into public.scout_prospects (run_id, business_key, name, score, angle, assigned_to, signals) values ('00000000-0000-0000-0000-0000000005c1', 'd:x3.example.com', 'Sample Y (fictional)', 50, 'seo', '00000000-0000-0000-0000-0000000000a6', '{"phone":"3305550100"}')$$, -2, 'prospect signals refuse phone numbers');
select test.expect($$insert into public.scout_prospects (run_id, business_key, name, score, angle, assigned_to) values ('00000000-0000-0000-0000-0000000005c1', 'n:x|y', 'The Pat Example (fictional) LLC', 50, 'seo', '00000000-0000-0000-0000-0000000000a6')$$, 0, 'a business that is already a client is skipped');
select test.expect($$insert into public.scout_prospects (run_id, business_key, name, score, angle, assigned_to) values ('00000000-0000-0000-0000-0000000005c1', 'n:a|b', 'Sample Roofing (fictional), Inc.', 50, 'seo', '00000000-0000-0000-0000-0000000000a6')$$, 0, 'a business already in the GoHighLevel copy is skipped (even though sales cannot read that lead)');
select test.expect($$update public.scout_prospects set name = 'Renamed' where id = '00000000-0000-0000-0000-0000000005a1'$$, -1, 'nobody can change a prospect''s business facts');
select test.expect($$update public.scout_prospects set status = 'won' where id = '00000000-0000-0000-0000-0000000005a1'$$, 0, 'sales cannot change their prospect''s status directly (only by logging a visit)');
select test.expect($$delete from public.scout_prospects$$, -1, 'sales cannot delete prospects');
select test.expect($$insert into public.scout_visits (prospect_id, kind, outcome, note) values ('00000000-0000-0000-0000-0000000005a1', 'walk_in', 'not_interested', 'Owner busy, try spring')$$, 1, 'sales logs a walk-in on their prospect');
select test.expect($$select * from public.scout_prospects where id = '00000000-0000-0000-0000-0000000005a1' and status = 'not_interested' and next_ok_on > current_date and assigned_to = '00000000-0000-0000-0000-0000000000a6'$$, 1, 'not interested: status moves and a try-again date is set; nothing else changes');
select test.expect($$insert into public.scout_visits (prospect_id, kind, outcome, note) values ('00000000-0000-0000-0000-0000000005a1', 'call', 'staff', 'call 330-555-0100')$$, -2, 'visit notes refuse phone numbers');
select test.expect($$insert into public.scout_visits (prospect_id, kind, outcome) values ('00000000-0000-0000-0000-0000000005a1', 'email', 'staff')$$, -2, 'unknown visit kinds are rejected');
select test.expect($$insert into public.scout_visits (prospect_id, kind, outcome, user_id) values ('00000000-0000-0000-0000-0000000005a1', 'call', 'staff', '00000000-0000-0000-0000-0000000000a7')$$, -1, 'sales cannot log a visit as someone else');
select test.expect($$update public.scout_visits set outcome = 'interested'$$, -1, 'visits cannot be changed');
select test.expect($$delete from public.scout_visits$$, -1, 'visits cannot be deleted');
select test.expect('select * from public.scout_do_not_contact', 0, 'sales cannot read the do-not-contact list');
select test.expect($$insert into public.scout_do_not_contact (business_key, name_key) values ('d:z.example.com', 'z')$$, -1, 'sales cannot write the do-not-contact list directly');
select test.expect($$update public.scout_settings set per_rep_monthly_usd = 500$$, 0, 'sales cannot raise the Scout caps');
select test.expect($$insert into public.scout_user_limits (user_id, monthly_usd) values ('00000000-0000-0000-0000-0000000000a6', 500)$$, -1, 'sales cannot set their own Scout cap');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","aal":"aal2"}';
select test.expect($$insert into public.scout_runs (id, area, kinds, size, est_usd) values ('00000000-0000-0000-0000-0000000005c2', 'Mahoning, Trumbull, Columbiana', '{general contractor}', 150, 6.25)$$, 1, 'owner starts a Scout run');
select test.expect($$insert into public.scout_prospects (id, run_id, business_key, name, score, angle) values ('00000000-0000-0000-0000-0000000005a2', '00000000-0000-0000-0000-0000000005c2', 'd:pool-one.example.com', 'Sample Pool One (fictional)', 70, 'seo')$$, 1, 'owner adds a prospect to the shared pool');
select test.expect($$insert into public.scout_prospects (id, run_id, business_key, name, score, angle) values ('00000000-0000-0000-0000-0000000005a3', '00000000-0000-0000-0000-0000000005c2', 'd:pool-two.example.com', 'Sample Pool Two (fictional)', 60, 'website')$$, 1, 'owner adds a second pool prospect');
select test.expect($$insert into public.scout_prospects (run_id, business_key, name, score, angle) values ('00000000-0000-0000-0000-0000000005c2', 'd:pool-one.example.com', 'Sample Pool One Again (fictional)', 70, 'seo')$$, -3, 'the same business is saved only once');
select test.expect('select * from public.scout_prospects', 3, 'owner reads every prospect');
select test.expect('select * from public.scout_runs', 2, 'owner reads every run');
select test.expect($$update public.scout_settings set monthly_usd = 25, updated_by = '00000000-0000-0000-0000-0000000000a1'$$, 1, 'owner sets the Scout caps');
select test.expect($$update public.scout_settings set monthly_usd = 99999, updated_by = '00000000-0000-0000-0000-0000000000a1'$$, -2, 'absurd Scout caps are rejected');
select test.expect($$insert into public.scout_spend (run_id, provider, usd) values ('00000000-0000-0000-0000-0000000005c1', 'dataforseo', 0.01)$$, -1, 'nobody records spend on someone else''s run');
select test.expect($$insert into public.scout_spend (run_id, provider, usd) values ('00000000-0000-0000-0000-0000000005c2', 'dataforseo', 15)$$, 1, 'owner spend up to the monthly total is allowed');
select test.expect($$insert into public.scout_spend (run_id, provider, usd) values ('00000000-0000-0000-0000-0000000005c2', 'dataforseo', 0.01)$$, -2, 'the $25/month Scout total stops everyone, the owner too');
select test.expect($$update public.scout_prospects set name = 'Renamed (fictional)', score = 1 where id = '00000000-0000-0000-0000-0000000005a2'$$, -1, 'even the owner cannot change business facts or the score');
select test.expect($$delete from public.scout_prospects$$, -1, 'even the owner cannot delete prospects');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a7","aal":"aal2"}';
select test.expect('select * from public.scout_prospects', 2, 'another salesperson sees only the shared pool, not someone else''s prospects');
select test.expect($$select * from public.scout_prospects where id = '00000000-0000-0000-0000-0000000005a1'$$, 0, 'a salesperson cannot read another salesperson''s prospect');
select test.expect('select * from public.scout_runs', 0, 'a salesperson cannot read someone else''s runs');
select test.expect('select * from public.scout_spend', 0, 'a salesperson cannot read someone else''s Scout spend');
select test.expect('select * from public.scout_visits', 0, 'a salesperson cannot read someone else''s visits');
select test.expect($$update public.scout_prospects set assigned_to = '00000000-0000-0000-0000-0000000000a6' where id = '00000000-0000-0000-0000-0000000005a3'$$, -1, 'a salesperson cannot claim for someone else');
select test.expect($$update public.scout_prospects set assigned_to = '00000000-0000-0000-0000-0000000000a7', status = 'won', archived_at = now() where id = '00000000-0000-0000-0000-0000000005a2'$$, -1, 'claiming cannot change anything else');
select test.expect($$update public.scout_prospects set assigned_to = '00000000-0000-0000-0000-0000000000a7' where id = '00000000-0000-0000-0000-0000000005a2'$$, 1, 'a salesperson claims a pool prospect for themselves');
select test.expect($$update public.scout_prospects set assigned_to = null where id = '00000000-0000-0000-0000-0000000005a2'$$, 0, 'a salesperson cannot put a prospect back in the pool');
select test.expect($$update public.scout_prospects set assigned_to = '00000000-0000-0000-0000-0000000000a7' where id = '00000000-0000-0000-0000-0000000005a1'$$, 0, 'a salesperson cannot take someone else''s prospect');
select test.expect($$insert into public.scout_visits (prospect_id, kind, outcome) values ('00000000-0000-0000-0000-0000000005a3', 'walk_in', 'owner')$$, -1, 'a salesperson cannot log a visit on a pool prospect they have not claimed');
select test.expect($$insert into public.scout_visits (prospect_id, kind, outcome) values ('00000000-0000-0000-0000-0000000005a2', 'walk_in', 'no_soliciting')$$, 1, 'a salesperson logs "no soliciting" on their prospect');
select test.expect($$select * from public.scout_prospects where id = '00000000-0000-0000-0000-0000000005a2' and status = 'do_not_contact'$$, 1, 'no soliciting = do not contact');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a6","aal":"aal2"}';
select test.expect($$select * from public.scout_prospects where id = '00000000-0000-0000-0000-0000000005a2'$$, 0, 'once claimed, other salespeople no longer see it');
select test.expect($$update public.scout_prospects set assigned_to = '00000000-0000-0000-0000-0000000000a6' where id = '00000000-0000-0000-0000-0000000005a2'$$, 0, 'a claimed prospect cannot be claimed again');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","aal":"aal2"}';
select test.expect('select * from public.scout_prospects', 3, 'a manager reads every prospect');
select test.expect('select * from public.scout_do_not_contact', 1, 'a manager reads the do-not-contact list (filled by the visit)');
select test.expect($$insert into public.scout_prospects (run_id, business_key, name, score, angle) values ('00000000-0000-0000-0000-0000000005c2', 'd:other-site.example.com', 'Sample Pool One (fictional)', 70, 'seo')$$, 0, 'a do-not-contact business is skipped in future runs, even under another web address');
select test.expect($$insert into public.scout_do_not_contact (business_key, name_key) values ('d:dnc.example.com', 'dnc')$$, 1, 'a manager adds to the do-not-contact list');
select test.expect($$delete from public.scout_do_not_contact$$, -1, 'nobody deletes from the do-not-contact list');
select test.expect($$update public.scout_prospects set assigned_to = '00000000-0000-0000-0000-0000000000a6', status = 'new' where id = '00000000-0000-0000-0000-0000000005a3'$$, 1, 'a manager assigns a prospect to a salesperson');
select test.expect($$update public.scout_settings set monthly_usd = 400, updated_by = '00000000-0000-0000-0000-0000000000a2'$$, 0, 'managers cannot change the Scout caps');
select test.expect($$insert into public.scout_user_limits (user_id, monthly_usd) values ('00000000-0000-0000-0000-0000000000a6', 50)$$, -1, 'managers cannot set a salesperson''s Scout cap');
select test.expect($$update public.scout_runs set status = 'attached', found = 2 where id = '00000000-0000-0000-0000-0000000005c2'$$, 1, 'a manager attaches results to a run');
select test.expect($$update public.scout_runs set status = 'attached', found = 3 where id = '00000000-0000-0000-0000-0000000005c2'$$, -2, 'results can be attached only once');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","aal":"aal2"}';
select test.expect('select * from public.scout_prospects', 0, 'developers read no prospects');
select test.expect('select * from public.scout_runs', 0, 'developers read no Scout runs');
select test.expect('select * from public.scout_settings', 0, 'developers read no Scout settings');
select test.expect('select * from public.scout_spend', 0, 'developers read no Scout spend');
select test.expect('select * from public.scout_visits', 0, 'developers read no visits');
select test.expect('select * from public.scout_do_not_contact', 0, 'developers read no do-not-contact list');
select test.expect($$insert into public.scout_runs (area, kinds, size, est_usd) values ('X', '{plumber}', 10, 1)$$, -1, 'developers cannot start Scout runs');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a6","aal":"aal1"}';
select test.expect('select * from public.scout_prospects', 0, 'sales without two-factor reads no prospects');
select test.expect($$insert into public.scout_runs (area, kinds, size, est_usd) values ('X', '{plumber}', 10, 1)$$, -1, 'sales without two-factor cannot start runs');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a4","aal":"aal2"}';
select test.expect('select * from public.scout_prospects', 0, 'someone not on the team reads no prospects');
select test.expect('select * from public.scout_settings', 0, 'someone not on the team reads no Scout settings');
commit;

-- ---------------------------------------------------------------------------
-- 7v. Client care (0025): plan tiers (owner edits, managers read), each client's tier
--     (manager may set it once on a new client), amounts OWNER ONLY, managers add clients
--     but never VIP or an amount, and clients.monthly_usd is locked for everyone.
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","aal":"aal2"}';
select test.expect('select * from public.care_plans', 3, 'manager reads the plan tiers');
select test.expect($$insert into public.care_plans (service, name) values ('SEO', 'Sneaky (test)')$$, -1, 'manager cannot add a tier');
select test.expect($$update public.care_plans set name = 'Renamed (test)'$$, 0, 'manager cannot edit tiers');
select test.expect($$delete from public.care_plans$$, -1, 'manager cannot delete tiers');
select test.expect('select * from public.client_money', 0, 'manager cannot read client amounts');
select test.expect($$insert into public.client_money (client_id, monthly_usd) values ('00000000-0000-0000-0000-0000000000c1', 1)$$, -1, 'manager cannot set an amount');
select test.expect('select monthly_usd from public.clients', -1, 'manager cannot read the old amount column');
select test.expect($$insert into public.clients (slug, name, start_date, status, services, care_started_on) values ('care-new', 'Care New (fictional)', '2026-11-20', 'active', '{SEO}', '2026-11-20')$$, 1, 'manager adds a client');
select test.expect($$insert into public.clients (slug, name, start_date, status, vip) values ('care-vip', 'Care VIP (fictional)', '2026-11-20', 'active', true)$$, -1, 'manager cannot add a VIP client');
select test.expect($$insert into public.clients (slug, name, start_date, status) values ('care-gone', 'Care Gone (fictional)', '2026-11-20', 'canceled')$$, -1, 'manager can only add active clients');
select test.expect($$insert into public.clients (id, slug, name, start_date, status) values ('00000000-0000-0000-0000-00000000cc99', 'care-id', 'Care Id (fictional)', '2026-11-20', 'active')$$, -1, 'nobody picks a client id through the app');
select test.expect($$insert into public.clients (slug, name, start_date, status) values ('care-new', 'Copy (fictional)', '2026-11-20', 'active')$$, -3, 'two clients cannot share an address (slug)');
select test.expect($$insert into public.client_plans (client_id, service, plan_id) select c.id, 'SEO', p.id from public.clients c, public.care_plans p where c.slug = 'care-new' and p.name = 'Starter'$$, 1, 'manager sets the tier of the new client');
select test.expect($$insert into public.client_plans (client_id, service, plan_id) select c.id, 'SEO', p.id from public.clients c, public.care_plans p where c.slug = 'care-new' and p.name = 'Pro'$$, -3, 'manager cannot add a second SEO tier');
select test.expect($$update public.client_plans set plan_id = (select id from public.care_plans where name = 'Pro')$$, 0, 'manager cannot change a tier afterwards');
select test.expect($$delete from public.client_plans$$, -1, 'manager cannot remove a tier');
select test.expect($$update public.clients set vip = true where slug = 'care-new'$$, -1, 'manager cannot make a client VIP afterwards');
select test.expect($$select * from public.client_plans where updated_by = '00000000-0000-0000-0000-0000000000a2'$$, 1, 'the database records who set the tier');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","aal":"aal2"}';
select test.expect('select monthly_usd from public.clients', -1, 'even the owner cannot read the old amount column (it lives in client_money now)');
select test.expect($$insert into public.client_money (client_id, monthly_usd) select id, 500 from public.clients where slug = 'care-new'$$, 1, 'owner sets the new client''s amount');
select test.expect($$update public.client_money set monthly_usd = 650 where client_id = (select id from public.clients where slug = 'care-new')$$, 1, 'owner changes an amount');
select test.expect($$select * from public.client_money where monthly_usd = 650 and updated_by = '00000000-0000-0000-0000-0000000000a1'$$, 1, 'owner reads amounts, stamped with who changed them');
select test.expect($$delete from public.client_money$$, -1, 'amounts are never deleted through the app');
select test.expect($$update public.clients set vip = true where slug = 'care-new'$$, 1, 'owner makes a client VIP');
select test.expect($$update public.client_plans set plan_id = (select id from public.care_plans where name = 'Pro')$$, 1, 'owner changes a client''s tier');
select test.expect($$update public.client_plans set plan_id = null$$, 1, 'owner can clear a tier (no deletes)');
select test.expect($$insert into public.care_plans (service, name, rank) values ('SEO', ' starter ', 4)$$, -3, 'two SEO tiers cannot share a name');
select test.expect($$insert into public.care_plans (service, name, rank) values ('Ads', 'Ads Basic (test)', 1)$$, 1, 'owner adds an Ads tier');
select test.expect($$update public.client_plans set plan_id = (select id from public.care_plans where name = 'Ads Basic (test)')$$, -2, 'an Ads tier cannot be a client''s SEO plan');
select test.expect($$insert into public.care_plans (service, name) values ('Plumbing', 'X (test)')$$, -2, 'unknown services are rejected');
select test.expect($$insert into public.care_plans (service, name, hours_per_month) values ('SEO', 'Huge (test)', 5000)$$, -2, 'silly hours are rejected');
select test.expect($$update public.care_plans set archived = true where name = 'Ads Basic (test)'$$, 1, 'owner archives a tier');
select test.expect($$delete from public.care_plans$$, -1, 'even the owner cannot delete tiers');
select test.expect($$select * from public.care_plans where name = 'Ads Basic (test)' and updated_by = '00000000-0000-0000-0000-0000000000a1'$$, 1, 'the database records who changed a tier');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","aal":"aal2"}';
select test.expect('select * from public.care_plans', 0, 'developer reads no tiers');
select test.expect('select * from public.client_plans', 0, 'developer reads no client tiers');
select test.expect('select * from public.client_money', 0, 'developer reads no amounts');
select test.expect($$insert into public.clients (slug, name, start_date, status) values ('dev-add', 'Dev Add (fictional)', '2026-11-20', 'active')$$, -1, 'developer cannot add clients');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a6","aal":"aal2"}';
select test.expect('select * from public.care_plans', 0, 'salesperson reads no tiers');
select test.expect('select * from public.client_money', 0, 'salesperson reads no amounts');
select test.expect($$insert into public.clients (slug, name, start_date, status) values ('sales-add', 'Sales Add (fictional)', '2026-11-20', 'active')$$, -1, 'salesperson cannot add clients');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a4","aal":"aal2"}';
select test.expect('select * from public.care_plans', 0, 'someone not on the team reads no tiers');
select test.expect('select * from public.client_money', 0, 'someone not on the team reads no amounts');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","aal":"aal1"}';
select test.expect('select * from public.care_plans', 0, 'owner without two-factor reads no tiers');
select test.expect('select * from public.client_money', 0, 'owner without two-factor reads no amounts');
select test.expect($$insert into public.care_plans (service, name) values ('SEO', 'No 2FA (test)')$$, -1, 'owner without two-factor cannot add a tier');
commit;

-- ---------------------------------------------------------------------------
-- 7x. Client journey (0028): managers pause / mark lost / bring back ONLY after logging
--     a reason; the log is add-only; touches are add-only and logged as yourself; managers
--     edit client memory and journey start but nothing else; the owner hears about "lost".
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","aal":"aal2"}';
select test.expect($$update public.clients set status = 'paused', end_date = current_date where slug = 'care-new'$$, -1, 'manager cannot pause a client without logging a reason first');
select test.expect($$insert into public.client_status_changes (client_id, from_status, to_status) select id, 'active', 'paused' from public.clients where slug = 'care-new'$$, -2, 'pausing needs a reason');
select test.expect($$insert into public.client_status_changes (client_id, from_status, to_status, reason) select id, 'active', 'incomplete_expired', 'other' from public.clients where slug = 'care-new'$$, -2, 'only active, paused or lost');
select test.expect($$insert into public.client_status_changes (client_id, from_status, to_status, reason, changed_by) select id, 'active', 'paused', 'price', '00000000-0000-0000-0000-0000000000a1' from public.clients where slug = 'care-new'$$, -1, 'nobody logs a status change as someone else');
select test.expect($$insert into public.client_status_changes (client_id, from_status, to_status, reason, note) select id, 'active', 'paused', 'price', 'Budget pause for winter (test)' from public.clients where slug = 'care-new'$$, 1, 'manager logs a pause with a reason');
select test.expect($$update public.clients set status = 'paused', end_date = current_date where slug = 'care-new'$$, 1, 'then the manager pauses the client');
select test.expect($$insert into public.client_status_changes (client_id, from_status, to_status, reason) select id, 'paused', 'canceled', 'results' from public.clients where slug = 'care-new'$$, 1, 'manager logs a client as lost');
select test.expect($$update public.clients set status = 'canceled' where slug = 'care-new'$$, 1, 'then marks them lost (nothing is deleted)');
select test.expect($$select id from public.clients where slug = 'care-new' and status = 'canceled'$$, 1, 'the lost client is still there');
select test.expect($$update public.client_status_changes set reason = 'other'$$, -1, 'the status log cannot be edited');
select test.expect($$delete from public.client_status_changes$$, -1, 'the status log cannot be deleted');
select test.expect($$update public.clients set name = 'Renamed (fictional)' where slug = 'care-new'$$, -1, 'manager still cannot rename a client');
select test.expect($$update public.clients set services = '{Ads}', status = 'active' where slug = 'care-new'$$, -1, 'manager cannot sneak other changes in with a status change');
select test.expect($$update public.clients set memory_goal = 'More showroom bookings', memory_tone = 'Warm, no jargon', memory_next_ask = 'Confirm the December offer' where slug = 'care-new'$$, 1, 'manager edits client memory');
select test.expect($$update public.clients set memory_goal = repeat('x', 121) where slug = 'care-new'$$, -2, 'client memory notes stay short');
select test.expect($$update public.clients set care_started_on = current_date where slug = 'care-new'$$, 1, 'manager restarts the journey');
select test.expect($$insert into public.care_touches (client_id, step, status, happened_on, channel, note) select id, 1, 'done', current_date, 'call', 'Kickoff call (test)' from public.clients where slug = 'care-new'$$, 1, 'manager marks a touch done');
select test.expect($$insert into public.care_touches (client_id, step, status, happened_on) select id, 2, 'done', current_date from public.clients where slug = 'care-new'$$, -2, 'done needs how it happened (call, text, email, video)');
select test.expect($$insert into public.care_touches (client_id, step, status, happened_on) select id, 2, 'skipped', current_date from public.clients where slug = 'care-new'$$, -2, 'skip needs a reason');
select test.expect($$insert into public.care_touches (client_id, step, status, happened_on, note) select id, 2, 'skipped', current_date, 'Client asked for email only (test)' from public.clients where slug = 'care-new'$$, 1, 'manager skips a touch with a reason');
select test.expect($$insert into public.care_touches (client_id, step, status, happened_on, channel) select id, 50, 'done', current_date, 'call' from public.clients where slug = 'care-new'$$, -2, 'unknown touch numbers are rejected');
select test.expect($$insert into public.care_touches (client_id, step, status, happened_on, channel) select id, 3, 'done', current_date + 30, 'call' from public.clients where slug = 'care-new'$$, -2, 'touches cannot be logged in the future');
select test.expect($$insert into public.care_touches (client_id, step, status, happened_on, channel, logged_by) select id, 3, 'done', current_date, 'call', '00000000-0000-0000-0000-0000000000a1' from public.clients where slug = 'care-new'$$, -1, 'nobody logs a touch as someone else');
select test.expect($$update public.care_touches set note = 'changed'$$, -1, 'touches cannot be edited');
select test.expect($$delete from public.care_touches$$, -1, 'touches cannot be deleted');
select test.expect($$insert into public.client_status_changes (client_id, from_status, to_status, reason) select id, 'canceled', 'active', 'back' from public.clients where slug = 'care-new'$$, 1, 'manager logs bringing a client back');
select test.expect($$update public.clients set status = 'active', end_date = null where slug = 'care-new'$$, 1, 'then brings them back');
select test.expect('select * from public.notifications where kind = ''client_lost''', 0, 'managers do not get the owner''s notices');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","aal":"aal2"}';
select test.expect('select * from public.notifications where kind = ''client_lost''', 1, 'the owner gets one notice when a manager marks a client lost');
select test.expect('select * from public.care_touches', 2, 'owner reads the touches');
select test.expect('select * from public.client_status_changes', 3, 'owner reads the status log');
select test.expect($$update public.clients set status = 'paused' where slug = 'care-new'$$, 1, 'the owner can change status directly (the app still logs it)');
select test.expect($$delete from public.client_status_changes$$, -1, 'even the owner cannot delete the status log');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","aal":"aal2"}';
select test.expect('select * from public.care_touches', 0, 'developer reads no touches');
select test.expect('select * from public.client_status_changes', 0, 'developer reads no status log');
select test.expect($$insert into public.care_touches (client_id, step, status, happened_on, channel) values ('00000000-0000-0000-0000-0000000000c1', 1, 'done', current_date, 'call')$$, -1, 'developer cannot log touches');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a6","aal":"aal2"}';
select test.expect('select * from public.care_touches', 0, 'salesperson reads no touches');
select test.expect($$insert into public.client_status_changes (client_id, from_status, to_status, reason) values ('00000000-0000-0000-0000-0000000000c1', 'active', 'canceled', 'price')$$, -1, 'salesperson cannot change client status');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","aal":"aal1"}';
select test.expect('select * from public.care_touches', 0, 'owner without two-factor reads no touches');
select test.expect('select * from public.client_status_changes', 0, 'owner without two-factor reads no status log');
commit;

-- ---------------------------------------------------------------------------
-- 7w. Sales leaderboard (0026): one read-only view of totals. Owner, managers and sales
--     read it (two-factor); it lists salespeople plus linked owner/managers, with this
--     month's Won value from GoHighLevel copies (sales pipelines only once picked).
--     Salespeople still can't read the won deals behind the totals.
-- ---------------------------------------------------------------------------
update public.team_members set ghl_user_id = 'ghluserOwn1' where user_id = '00000000-0000-0000-0000-0000000000a1';
insert into public.ghl_opportunities (ghl_id, name, status, monetary_value, pipeline_id, assigned_user_id, status_changed_at) values
  ('wdeal1', 'Sample Won Roofing (fictional)', 'won', 5000, 'pipeSales', 'ghluser01', now()),
  ('wdeal2', 'Sample Old Win (fictional)', 'won', 2500, 'pipeSales', 'ghluser01', '2000-01-15'),
  ('wdeal3', 'Sample Dev Win (fictional)', 'won', 1000, 'pipeDev', 'ghluser01', now()),
  ('wdeal4', 'Sample Won Bakery (fictional)', 'won', 750, 'pipeSales', 'ghluser09', now()),
  ('wdeal5', 'Sample No Value Win (fictional)', 'won', null, 'pipeSales', 'ghluser01', now()),
  ('wdeal6', 'Sample Lost (fictional)', 'lost', 9000, 'pipeSales', 'ghluser01', now()),
  ('wdeal7', 'Sample Owner Win (fictional)', 'won', 4000, 'pipeSales', 'ghluserOwn1', now());

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a6","aal":"aal2"}';
select test.expect('select * from public.sales_leaderboard', 3, 'sales sees the board: both salespeople and the linked owner (not the unlinked manager or developers)');
select test.expect($$select * from public.sales_leaderboard where is_me and name = 'Sales 1 (test)' and won_usd = 5000 and won_deals = 2$$, 1, 'only this month''s Won deals in sales pipelines count (old, other-pipeline and lost deals do not)');
select test.expect($$select * from public.sales_leaderboard where name = 'Sales 2 (test)' and won_usd = 750 and not is_me$$, 1, 'the other salesperson''s total, credited by their GoHighLevel link');
select test.expect($$select * from public.sales_leaderboard where name = 'Owner (test)' and won_usd = 4000 and linked$$, 1, 'a linked owner is on the board');
select test.expect($$select * from public.ghl_opportunities where ghl_id like 'wdeal%'$$, 0, 'sales still cannot read the won deals behind the totals');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","aal":"aal2"}';
select test.expect('select * from public.sales_leaderboard', 3, 'a manager reads the board');
commit;

-- Before any sales pipeline is picked, every pipeline counts.
update public.sales_pipelines set active = false;
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a6","aal":"aal2"}';
select test.expect($$select * from public.sales_leaderboard where is_me and won_usd = 6000 and won_deals = 3$$, 1, 'with no sales pipelines picked, Won deals in every pipeline count');
commit;
update public.sales_pipelines set active = true;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","aal":"aal2"}';
select test.expect('select * from public.sales_leaderboard', 0, 'developers read nothing from the board');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a6","aal":"aal1"}';
select test.expect('select * from public.sales_leaderboard', 0, 'sales without two-factor read nothing from the board');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a4","aal":"aal2"}';
select test.expect('select * from public.sales_leaderboard', 0, 'someone not on the team reads nothing from the board');
commit;

begin;
set local role anon;
select test.expect('select * from public.sales_leaderboard', -1, 'signed out cannot read the board');
commit;

do $$
declare cols text;
begin
  select string_agg(column_name, ',' order by column_name) into cols
  from information_schema.columns where table_schema = 'public' and table_name = 'sales_leaderboard';
  if cols <> 'is_me,linked,name,won_deals,won_usd' then
    raise exception 'FAILED: sales_leaderboard exposes unexpected columns: %', cols;
  end if;
  raise notice 'ok: the board shows only name, linked, is_me and totals';
  if has_table_privilege('authenticated', 'public.sales_leaderboard', 'INSERT, UPDATE, DELETE, TRUNCATE') then
    raise exception 'FAILED: signed-in users can write to sales_leaderboard';
  end if;
  raise notice 'ok: the board is read-only (select is the only permission)';
end;
$$;

-- ---------------------------------------------------------------------------
-- 7x. SEO Watcher (0027): owner/managers run it; developers read ONLY clients they work
--     on (no costs); salespeople see nothing. List limits, the monthly cap and the
--     add-only history are enforced by the database.
-- ---------------------------------------------------------------------------
insert into public.clients (id, slug, name, start_date, status) values
  ('00000000-0000-0000-0000-0000000007c1', 'watch-one', 'Watch One (fictional)', '2026-03-01', 'active'),
  ('00000000-0000-0000-0000-0000000007c2', 'watch-two', 'Watch Two (fictional)', '2026-04-01', 'active');
-- The developer (staff b3) has open work on Watch One only.
insert into public.actions (id, client_id, kind, title, owner_staff_id, created_by) values
  ('00000000-0000-0000-0000-0000000007a1', '00000000-0000-0000-0000-0000000007c1', 'issue', 'Fix page titles (test)', '00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000a1');

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","aal":"aal2"}';
select test.expect('select * from public.watch_settings where monthly_usd = 20 and keywords_per_client = 25', 1, 'owner reads the Watcher settings ($20 cap, 25 keywords)');
select test.expect($$insert into public.watch_clients (client_id, domain, niche) values ('00000000-0000-0000-0000-0000000007c1', 'watch-one.example.com', 'Plumbing')$$, 1, 'owner starts watching a client');
select test.expect($$insert into public.watch_clients (client_id, domain, niche) values ('00000000-0000-0000-0000-0000000007c2', 'watch-two.example.com', 'Roofing')$$, 1, 'owner starts watching a second client');
select test.expect($$insert into public.watch_clients (client_id, domain, niche) values ('00000000-0000-0000-0000-0000000000c1', 'https://x.example.com/', 'Plumbing')$$, -2, 'watched websites must be bare domains');
select test.expect($$insert into public.watch_clients (client_id, domain, niche) values ('00000000-0000-0000-0000-0000000000c1', 'x.example.com', 'call 330-555-0100')$$, -2, 'niches refuse phone numbers');
select test.expect($$insert into public.watch_clients (client_id, domain, niche, added_by) values ('00000000-0000-0000-0000-0000000000c1', 'x.example.com', 'Plumbing', '00000000-0000-0000-0000-0000000000a2')$$, -1, 'nobody adds a watched client in someone else''s name');
select test.expect($$insert into public.watch_keywords (id, client_id, keyword, money) values ('00000000-0000-0000-0000-0000000007b1', '00000000-0000-0000-0000-0000000007c1', 'plumber near me', true)$$, 1, 'owner adds a money keyword');
select test.expect($$insert into public.watch_keywords (client_id, keyword) values ('00000000-0000-0000-0000-0000000007c1', 'plumber near me')$$, -3, 'the same keyword twice is refused');
select test.expect($$insert into public.watch_keywords (client_id, keyword) values ('00000000-0000-0000-0000-0000000007c1', 'Plumber Akron')$$, -2, 'keywords are stored in lower case');
select test.expect($$insert into public.watch_keywords (client_id, keyword) values ('00000000-0000-0000-0000-0000000007c1', 'pat@example.com')$$, -2, 'keywords refuse email addresses');
select test.expect($$update public.watch_settings set keywords_per_client = 2, updated_by = '00000000-0000-0000-0000-0000000000a1'$$, 1, 'owner lowers the keyword limit (for this test)');
select test.expect($$insert into public.watch_keywords (id, client_id, keyword) values ('00000000-0000-0000-0000-0000000007b2', '00000000-0000-0000-0000-0000000007c1', 'drain cleaning')$$, 1, 'a keyword up to the limit is allowed');
select test.expect($$insert into public.watch_keywords (client_id, keyword) values ('00000000-0000-0000-0000-0000000007c1', 'water heater repair')$$, -2, 'a full keyword list refuses more');
select test.expect($$update public.watch_keywords set active = false where id = '00000000-0000-0000-0000-0000000007b2'$$, 1, 'owner pauses a keyword');
select test.expect($$insert into public.watch_keywords (id, client_id, keyword) values ('00000000-0000-0000-0000-0000000007b3', '00000000-0000-0000-0000-0000000007c1', 'water heater repair')$$, 1, 'a paused keyword frees a spot');
select test.expect($$update public.watch_keywords set active = true where id = '00000000-0000-0000-0000-0000000007b2'$$, -2, 'turning a paused keyword back on still respects the limit');
select test.expect($$update public.watch_settings set keywords_per_client = 25, updated_by = '00000000-0000-0000-0000-0000000000a1'$$, 1, 'owner puts the keyword limit back');
select test.expect($$insert into public.watch_keywords (id, client_id, keyword) values ('00000000-0000-0000-0000-0000000007b4', '00000000-0000-0000-0000-0000000007c2', 'roof repair')$$, 1, 'owner adds a keyword for the second client');
select test.expect($$insert into public.watch_markets (id, client_id, city, state, lat, lng) values ('00000000-0000-0000-0000-0000000007d1', '00000000-0000-0000-0000-0000000007c1', 'Springfield', 'OH', 39.92, -83.81)$$, 1, 'owner adds a city');
select test.expect($$insert into public.watch_markets (id, client_id, city, state) values ('00000000-0000-0000-0000-0000000007d2', '00000000-0000-0000-0000-0000000007c2', 'Dayton', 'OH')$$, 1, 'a city can start without a map position');
select test.expect($$insert into public.watch_markets (client_id, city, state) values ('00000000-0000-0000-0000-0000000007c1', 'Akron', 'Ohio')$$, -2, 'states are two capital letters');
select test.expect($$insert into public.watch_markets (client_id, city, state, lat, lng) values ('00000000-0000-0000-0000-0000000007c1', 'Akron', 'OH', 10, -81)$$, -2, 'map positions must be in the USA');
select test.expect($$update public.watch_markets set lat = 39.76, lng = -84.19 where id = '00000000-0000-0000-0000-0000000007d2'$$, 1, 'owner fills in a city''s map position later');
select test.expect($$update public.watch_markets set city = 'Elsewhere' where id = '00000000-0000-0000-0000-0000000007d2'$$, -1, 'a city''s name cannot be changed (add a new one instead)');
select test.expect($$insert into public.watch_competitors (client_id, domain) values ('00000000-0000-0000-0000-0000000007c1', 'rival-one.example.com')$$, 1, 'owner adds a competitor');
select test.expect($$insert into public.watch_competitors (client_id, domain) values ('00000000-0000-0000-0000-0000000007c1', 'not a domain')$$, -2, 'competitors must be bare domains');
select test.expect($$insert into public.watch_runs (id, client_ids, pairs, est_usd) values ('00000000-0000-0000-0000-0000000007e1', '{00000000-0000-0000-0000-0000000007c1,00000000-0000-0000-0000-0000000007c2}', 3, 5)$$, 1, 'owner starts a round of checks with its estimate');
select test.expect($$insert into public.watch_runs (client_ids, pairs, est_usd) values ('{00000000-0000-0000-0000-0000000007c1}', 3, 16)$$, -2, 'the $20 monthly cap refuses a round that would go over');
select test.expect($$insert into public.watch_runs (id, client_ids, pairs, est_usd) values ('00000000-0000-0000-0000-0000000007e2', '{00000000-0000-0000-0000-0000000007c2}', 1, 15)$$, 1, 'a round up to the cap is allowed');
select test.expect($$select * from public.watch_runs where created_by = '00000000-0000-0000-0000-0000000000a1'$$, 2, 'rounds are always stamped with the person who started them');
select test.expect($$insert into public.watch_rank_checks (run_id, client_id, keyword_id, market_id, checked_on, organic, pack, url, others, source) values ('00000000-0000-0000-0000-0000000007e1', '00000000-0000-0000-0000-0000000007c1', '00000000-0000-0000-0000-0000000007b1', '00000000-0000-0000-0000-0000000007d1', (now() at time zone 'America/New_York')::date, 4, 1, 'https://watch-one.example.com/', '[{"domain":"rival-one.example.com","position":2}]', 'dataforseo')$$, 1, 'owner saves a rank check from a round');
select test.expect($$insert into public.watch_rank_checks (run_id, client_id, keyword_id, market_id, checked_on, organic, source) values ('00000000-0000-0000-0000-0000000007e1', '00000000-0000-0000-0000-0000000007c1', '00000000-0000-0000-0000-0000000007b1', '00000000-0000-0000-0000-0000000007d1', (now() at time zone 'America/New_York')::date, 5, 'dataforseo')$$, -3, 'one check per keyword, city and day');
select test.expect($$insert into public.watch_rank_checks (run_id, client_id, keyword_id, market_id, checked_on, organic, source) values ('00000000-0000-0000-0000-0000000007e1', '00000000-0000-0000-0000-0000000007c1', '00000000-0000-0000-0000-0000000007b3', '00000000-0000-0000-0000-0000000007d1', (now() at time zone 'America/New_York')::date + 2, 5, 'dataforseo')$$, -2, 'checks cannot be dated in the future');
select test.expect($$insert into public.watch_rank_checks (run_id, client_id, keyword_id, market_id, checked_on, organic, source) values ('00000000-0000-0000-0000-0000000007e1', '00000000-0000-0000-0000-0000000007c1', '00000000-0000-0000-0000-0000000007b3', '00000000-0000-0000-0000-0000000007d2', (now() at time zone 'America/New_York')::date, 5, 'dataforseo')$$, -2, 'a check cannot mix one client''s keyword with another client''s city');
select test.expect($$insert into public.watch_rank_checks (run_id, client_id, keyword_id, market_id, checked_on, organic, source) values ('00000000-0000-0000-0000-0000000007e1', '00000000-0000-0000-0000-0000000007c1', '00000000-0000-0000-0000-0000000007b3', '00000000-0000-0000-0000-0000000007d1', (now() at time zone 'America/New_York')::date, 0, 'dataforseo')$$, -2, 'positions start at 1');
select test.expect($$insert into public.watch_rank_checks (run_id, client_id, keyword_id, market_id, checked_on, url, source) values ('00000000-0000-0000-0000-0000000007e1', '00000000-0000-0000-0000-0000000007c1', '00000000-0000-0000-0000-0000000007b3', '00000000-0000-0000-0000-0000000007d1', (now() at time zone 'America/New_York')::date, 'javascript:alert(1)', 'dataforseo')$$, -2, 'ranking pages must be web links');
select test.expect($$insert into public.watch_rank_checks (client_id, keyword_id, market_id, checked_on, organic, source) values ('00000000-0000-0000-0000-0000000007c1', '00000000-0000-0000-0000-0000000007b3', '00000000-0000-0000-0000-0000000007d1', (now() at time zone 'America/New_York')::date, 7, 'dataforseo')$$, -1, 'fetched checks must belong to a round');
select test.expect($$insert into public.watch_rank_checks (client_id, keyword_id, market_id, checked_on, organic, source) values ('00000000-0000-0000-0000-0000000007c1', '00000000-0000-0000-0000-0000000007b1', '00000000-0000-0000-0000-0000000007d1', '2026-01-05', 9, 'audit')$$, 1, 'a starting point imported from a saved audit needs no round');
select test.expect($$insert into public.watch_rank_checks (run_id, client_id, keyword_id, market_id, checked_on, organic, source) values ('00000000-0000-0000-0000-0000000007e2', '00000000-0000-0000-0000-0000000007c2', '00000000-0000-0000-0000-0000000007b4', '00000000-0000-0000-0000-0000000007d2', (now() at time zone 'America/New_York')::date, 12, 'dataforseo')$$, 1, 'owner saves a check for the second client');
select test.expect($$insert into public.watch_volumes (run_id, client_id, market_id, keyword, month, volume, cpc_usd, source) values ('00000000-0000-0000-0000-0000000007e1', '00000000-0000-0000-0000-0000000007c1', '00000000-0000-0000-0000-0000000007d1', 'plumber near me', date_trunc('month', now() at time zone 'America/New_York')::date, 1300, 18.5, 'dataforseo')$$, 1, 'owner saves a monthly search volume');
select test.expect($$insert into public.watch_volumes (run_id, client_id, market_id, keyword, month, volume, source) values ('00000000-0000-0000-0000-0000000007e1', '00000000-0000-0000-0000-0000000007c1', '00000000-0000-0000-0000-0000000007d1', 'drain cleaning', '2026-03-15', 100, 'dataforseo')$$, -2, 'volumes are stored per month (the 1st)');
select test.expect($$insert into public.watch_volumes (run_id, client_id, market_id, keyword, month, volume, source) values ('00000000-0000-0000-0000-0000000007e1', '00000000-0000-0000-0000-0000000007c1', '00000000-0000-0000-0000-0000000007d1', 'drain cleaning', (date_trunc('month', now() at time zone 'America/New_York') + interval '1 month')::date, 100, 'dataforseo')$$, -2, 'volumes cannot be dated in the future');
select test.expect($$insert into public.watch_volumes (run_id, client_id, market_id, keyword, month, volume, source) values ('00000000-0000-0000-0000-0000000007e1', '00000000-0000-0000-0000-0000000007c1', '00000000-0000-0000-0000-0000000007d2', 'drain cleaning', '2026-03-01', 100, 'dataforseo')$$, -2, 'a volume cannot use another client''s city');
select test.expect($$update public.watch_rank_checks set organic = 1$$, -1, 'rank checks cannot be changed');
select test.expect($$delete from public.watch_rank_checks$$, -1, 'rank checks cannot be deleted');
select test.expect($$update public.watch_volumes set volume = 1$$, -1, 'volumes cannot be changed');
select test.expect($$delete from public.watch_volumes$$, -1, 'volumes cannot be deleted');
select test.expect($$update public.watch_runs set est_usd = 0.01 where id = '00000000-0000-0000-0000-0000000007e1'$$, -1, 'a round''s estimate cannot be rewritten');
select test.expect($$update public.watch_runs set status = 'attached', actual_usd = 4.1, checks_saved = 2 where id = '00000000-0000-0000-0000-0000000007e1'$$, 1, 'owner marks the round attached with its real cost');
select test.expect($$select * from public.watch_runs where id = '00000000-0000-0000-0000-0000000007e1' and est_usd = 5 and attached_at is not null$$, 1, 'the database stamps when results were attached');
select test.expect($$update public.watch_runs set actual_usd = 0.5 where id = '00000000-0000-0000-0000-0000000007e1'$$, -2, 'an attached round cannot be changed again');
select test.expect($$insert into public.watch_rank_checks (run_id, client_id, keyword_id, market_id, checked_on, organic, source) values ('00000000-0000-0000-0000-0000000007e1', '00000000-0000-0000-0000-0000000007c1', '00000000-0000-0000-0000-0000000007b3', '00000000-0000-0000-0000-0000000007d1', (now() at time zone 'America/New_York')::date, 3, 'dataforseo')$$, -2, 'no more results for a round that is already attached');
select test.expect($$delete from public.watch_runs$$, -1, 'rounds cannot be deleted');
select test.expect($$delete from public.watch_clients$$, -1, 'watched clients cannot be deleted (pause them instead)');
select test.expect($$delete from public.watch_keywords$$, -1, 'keywords cannot be deleted (pause them instead)');
select test.expect($$update public.watch_clients set active = false where client_id = '00000000-0000-0000-0000-0000000007c2'$$, 1, 'owner pauses watching a client');
select test.expect($$update public.watch_clients set active = true where client_id = '00000000-0000-0000-0000-0000000007c2'$$, 1, 'owner resumes watching it');
select test.expect('select * from public.watch_client_names', 2, 'owner sees both watched clients by name');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","aal":"aal2"}';
select test.expect('select * from public.watch_client_names', 2, 'manager sees every watched client');
select test.expect('select * from public.watch_runs', 2, 'manager sees the rounds and their costs');
select test.expect($$insert into public.watch_keywords (client_id, keyword) values ('00000000-0000-0000-0000-0000000007c2', 'metal roofing')$$, 1, 'manager adds a keyword');
select test.expect($$update public.watch_settings set monthly_usd = 500, updated_by = '00000000-0000-0000-0000-0000000000a2'$$, 0, 'manager cannot raise the Watcher cap');
select test.expect($$update public.watch_keywords set keyword = 'other' where id = '00000000-0000-0000-0000-0000000007b1'$$, -1, 'a keyword''s words cannot be changed (add a new one instead)');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","aal":"aal2"}';
select test.expect('select * from public.watch_client_names', 1, 'developer sees only the watched client they work on');
select test.expect($$select * from public.watch_client_names where client_id = '00000000-0000-0000-0000-0000000007c1'$$, 1, 'developer sees their client by name');
select test.expect('select * from public.watch_clients', 1, 'developer reads only their watched client');
select test.expect($$select * from public.watch_keywords where client_id = '00000000-0000-0000-0000-0000000007c2'$$, 0, 'developer cannot read another client''s keywords');
select test.expect('select * from public.watch_markets', 1, 'developer reads only their client''s cities');
select test.expect('select * from public.watch_competitors', 1, 'developer reads their client''s competitors');
select test.expect('select * from public.watch_rank_checks', 2, 'developer reads only their client''s rank checks');
select test.expect('select * from public.watch_volumes', 1, 'developer reads their client''s search volumes');
select test.expect('select * from public.watch_runs', 0, 'developer sees no rounds or costs');
select test.expect('select * from public.watch_settings', 0, 'developer sees no cap');
select test.expect($$insert into public.watch_keywords (client_id, keyword) values ('00000000-0000-0000-0000-0000000007c1', 'sewer repair')$$, -1, 'developer cannot add keywords');
select test.expect($$update public.watch_keywords set active = false$$, 0, 'developer cannot pause keywords');
select test.expect($$insert into public.watch_clients (client_id, domain, niche) values ('00000000-0000-0000-0000-0000000000c1', 'x.example.com', 'Plumbing')$$, -1, 'developer cannot start watching a client');
select test.expect($$insert into public.watch_runs (client_ids, pairs, est_usd) values ('{00000000-0000-0000-0000-0000000007c1}', 1, 0.01)$$, -1, 'developer cannot start a round');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a6","aal":"aal2"}';
select test.expect('select * from public.watch_client_names', 0, 'salesperson sees no watched clients');
select test.expect('select * from public.watch_clients', 0, 'salesperson reads no watched clients');
select test.expect('select * from public.watch_rank_checks', 0, 'salesperson reads no rankings');
select test.expect('select * from public.watch_volumes', 0, 'salesperson reads no search volumes');
select test.expect('select * from public.watch_runs', 0, 'salesperson reads no rounds');
select test.expect('select * from public.watch_settings', 0, 'salesperson reads no Watcher settings');
select test.expect($$insert into public.watch_keywords (client_id, keyword) values ('00000000-0000-0000-0000-0000000007c1', 'sales keyword')$$, -1, 'salesperson cannot add keywords');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a4","aal":"aal2"}';
select test.expect('select * from public.watch_client_names', 0, 'someone not on the team sees no watched clients');
select test.expect('select * from public.watch_rank_checks', 0, 'someone not on the team reads no rankings');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","aal":"aal1"}';
select test.expect('select * from public.watch_client_names', 0, 'owner without two-factor sees no watched clients');
select test.expect('select * from public.watch_rank_checks', 0, 'owner without two-factor reads no rankings');
select test.expect($$insert into public.watch_keywords (client_id, keyword) values ('00000000-0000-0000-0000-0000000007c1', 'no two factor')$$, -1, 'owner without two-factor cannot add keywords');
commit;

begin;
set local role anon;
select test.expect('select * from public.watch_client_names', -1, 'signed out cannot read watched clients');
select test.expect('select * from public.watch_rank_checks', -1, 'signed out cannot read rankings');
commit;

-- ---------------------------------------------------------------------------
-- 8. Every table has RLS on, and anon has no table permissions at all.
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

  -- Any NEW table must also get a two-factor rule, or this fails.
  select string_agg(c.relname, ', ') into bad
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and not exists (
      select 1 from pg_policies p
      where p.schemaname = 'public' and p.tablename = c.relname
        and p.permissive = 'RESTRICTIVE' and p.qual like '%aal2%'
    );
  if bad is not null then raise exception 'FAILED: no two-factor rule on: %', bad; end if;
  raise notice 'ok: every table requires two-factor';
end;
$$;

select 'ALL BREAK-IN TESTS PASSED' as result;
