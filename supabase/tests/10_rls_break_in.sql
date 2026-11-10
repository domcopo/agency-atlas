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
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a4","aal":"aal2"}';
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
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","aal":"aal2"}';
select test.expect('select * from public.clients', 0, 'developer sees no client records');
select test.expect('select * from public.team_members', 1, 'developer sees only their own team row');
select test.expect($$insert into public.atlas_answers (question_key, status) values ('k', 'skipped')$$, -1, 'developer cannot answer Atlas asks');
commit;

-- ---------------------------------------------------------------------------
-- 4. Manager: reads clients, logs check-ins as themselves, cannot edit clients.
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","aal":"aal2"}';
select test.expect('select * from public.clients', 1, 'manager reads clients');
select test.expect('select * from public.team_members', 1, 'manager sees only their own team row');
select test.expect($$update public.clients set monthly_usd = 1$$, 0, 'manager cannot edit client amounts');
select test.expect($$insert into public.clients (slug, name, monthly_usd, start_date, status) values ('x', 'X', 1, '2026-01-01', 'active')$$, -1, 'manager cannot add clients');
select test.expect($$insert into public.check_ins (client_id, happened_on) values ('00000000-0000-0000-0000-0000000000c1', '2026-11-01')$$, 1, 'manager logs a check-in');
select test.expect($$insert into public.check_ins (client_id, happened_on, mood) values ('00000000-0000-0000-0000-0000000000c1', '2026-11-02', 'worse')$$, 1, 'manager logs a check-in with how they are doing');
select test.expect($$insert into public.check_ins (client_id, happened_on, mood) values ('00000000-0000-0000-0000-0000000000c1', '2026-11-02', 'furious')$$, -2, 'unknown moods are rejected');
select test.expect($$update public.check_ins set mood = 'better'$$, -1, 'a mood cannot be changed afterwards');
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
select test.expect($$update public.clients set monthly_usd = -5 where slug = 'pat-example'$$, -2, 'negative amounts are rejected');
select test.expect($$insert into public.atlas_answers (question_key, status, answer) values ('svc:x', 'answered', 'SEO')$$, 1, 'owner answers Atlas asks');
select test.expect($$delete from public.clients$$, -1, 'even the owner cannot delete clients through the app');
select test.expect($$delete from public.atlas_answers$$, -1, 'answer history cannot be deleted');
select test.expect($$update public.check_ins set note = 'changed'$$, -1, 'check-in history cannot be rewritten');
select test.expect($$insert into public.team_members (user_id, display_name, role) values ('00000000-0000-0000-0000-0000000000a4', 'X', 'owner')$$, -1, 'nobody can add team members through the app');
commit;

-- ---------------------------------------------------------------------------
-- 6. Password only (no two-factor yet): even the owner gets nothing.
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","aal":"aal1"}';
select test.expect('select * from public.clients', 0, 'owner without two-factor sees no clients');
select test.expect('select * from public.team_members', 0, 'owner without two-factor sees no team');
select test.expect('select * from public.staff', 0, 'owner without two-factor sees no staff');
select test.expect('select * from public.check_ins', 0, 'owner without two-factor sees no check-ins');
select test.expect($$update public.clients set monthly_usd = 1$$, 0, 'owner without two-factor cannot edit clients');
select test.expect($$insert into public.check_ins (client_id, happened_on) values ('00000000-0000-0000-0000-0000000000c1', '2026-11-01')$$, -1, 'owner without two-factor cannot log a check-in');
select test.expect($$insert into public.atlas_answers (question_key, status) values ('k', 'skipped')$$, -1, 'owner without two-factor cannot answer Atlas asks');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2"}';
select test.expect('select * from public.clients', 0, 'manager with no two-factor level at all sees no clients');
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
select test.expect($$delete from public.actions$$, -1, 'actions cannot be deleted');
select test.expect($$update public.clients set owner_staff_id = '00000000-0000-0000-0000-0000000000b2'$$, 0, 'manager cannot set client owners');
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
select test.expect($$delete from public.actions$$, -1, 'even the owner cannot delete actions');
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
select test.expect('select * from public.clients', 0, 'developer still cannot read clients (no revenue)');
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
select test.expect($$delete from public.actions$$, -1, 'developer cannot delete items');
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
select test.expect($$delete from public.actions where id = '00000000-0000-0000-0000-00000000ca01'$$, -1, 'manager still cannot delete work');
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
select test.expect($$delete from public.actions where id = '00000000-0000-0000-0000-00000000ca01'$$, -1, 'even the owner cannot delete work (cancel keeps it)');
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
