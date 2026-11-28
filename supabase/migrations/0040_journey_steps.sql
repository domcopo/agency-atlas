-- Agency Atlas: editable journey steps + placing clients by start date (approved 2026-11-25,
-- docs/CLIENTS_JOURNEY_LINE_PLAN.md). Numbered 0040 (0037 audit spend settle, 0038 Work hub and 0039 my_work were taken first; written as 0038, renumbered 2026-11-28).
--
-- Run ONCE in the Supabase SQL Editor, AFTER the app code for it is deployed. Before running
-- it, check that today's daily backup exists (Supabase > Database > Backups). Undo is at the end.
-- Nothing existing is changed or deleted. The app works before this is run (it uses the
-- wording in src/lib/journey.ts).
--
-- What this adds:
-- * journey_steps – the 27 first-90-day touches + the 3 "Grow" rhythm steps, seeded with
--   exactly today's wording, each with a deliverable type. Owner/managers edit the words,
--   day, channel and deliverable; step numbers and stages are fixed (history, points and
--   "moved a stage" count by step number). Owner/managers/VAs read; developers and sales
--   read nothing. Nobody adds or deletes rows. Days must stay in order (a trigger checks).
-- * clients.journey_placed_step – set by the owner's one-time "Place by start date": touches
--   before it count as "placed" (not done, not overdue, no points). Only the owner sets it.
--   Restarting a journey (anyone allowed to change care_started_on) clears it automatically.

begin;

-- ---------------------------------------------------------------------------
-- 1. journey_steps
-- ---------------------------------------------------------------------------
-- Keep the deliverable list in step with JOURNEY_DELIVERABLES in src/lib/journey.ts (a test checks).
create table public.journey_steps (
  step         smallint primary key check (step between 1 and 27 or step between 101 and 103),
  stage        smallint not null check (stage between 0 and 5),
  day          smallint not null check (day between 0 and 120),
  title        text not null check (char_length(btrim(title)) between 1 and 60),
  how          text not null check (char_length(btrim(how)) between 1 and 60),
  channel      text not null check (channel in ('call', 'text', 'email', 'video')),
  with_seo     boolean not null default false,
  say          text not null check (char_length(btrim(say)) between 1 and 400),
  ask          text check (ask is null or char_length(btrim(ask)) between 1 and 300),
  template     text check (template is null or char_length(btrim(template)) between 1 and 1000),
  deliverable  text not null default 'none' check (deliverable in ('none', 'baseline_audit', 'progress_update',
                 'heat_map', 'monthly_report', 'gbp_recs', 'pages_update', 'review_photo_ask', 'survey', 'referral_ask')),
  updated_by   uuid references auth.users (id),
  updated_at   timestamptz not null default now(),
  -- Onboarding touches sit in stages 0-4; the Grow rhythm is stage 5 with no day.
  constraint journey_steps_stage_fits check ((step <= 27 and stage <= 4) or (step >= 101 and stage = 5 and day = 0)),
  -- Copy-only drafts use placeholders, never real contact details or secrets.
  constraint journey_steps_no_contacts check (
    coalesce(template, '') || ' ' || say || ' ' || coalesce(ask, '') !~ '[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}'
    and coalesce(template, '') || ' ' || say || ' ' || coalesce(ask, '') !~ '\(?\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}'
    and coalesce(template, '') || ' ' || say || ' ' || coalesce(ask, '') !~* '(password|passcode|passwd|pwd)\s*[:=]\s*\S'
    and coalesce(template, '') !~ 'sk-[A-Za-z0-9_-]{20,}'
  )
);

-- The database stamps who saved it, keeps step and stage fixed, and keeps days in order.
create function private.journey_step_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  before_day smallint;
  after_day  smallint;
begin
  new.step := old.step;
  new.stage := old.stage;
  new.updated_by := auth.uid();
  new.updated_at := now();
  if new.step <= 27 then
    select max(s.day) into before_day from public.journey_steps s where s.step < new.step and s.step <= 27;
    select min(s.day) into after_day from public.journey_steps s where s.step > new.step and s.step <= 27;
    if (before_day is not null and new.day < before_day) or (after_day is not null and new.day > after_day) then
      raise exception 'touch % must stay between day % and day %', new.step, coalesce(before_day, 0), coalesce(after_day, 120)
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function private.journey_step_guard() from public, anon, authenticated;
create trigger journey_steps_guard before update on public.journey_steps
  for each row execute function private.journey_step_guard();

revoke all on public.journey_steps from public, anon, authenticated;
grant select on public.journey_steps to authenticated;
grant update (day, title, how, channel, with_seo, say, ask, template, deliverable) on public.journey_steps to authenticated;
-- No insert or delete grant: the 30 rows below are the whole plan.

alter table public.journey_steps enable row level security;
create policy journey_steps_read on public.journey_steps for select to authenticated
  using ((select private.my_role()) in ('owner', 'manager', 'va'));
create policy journey_steps_edit on public.journey_steps for update to authenticated
  using ((select private.my_role()) in ('owner', 'manager'))
  with check ((select private.my_role()) in ('owner', 'manager'));
create policy journey_steps_requires_2fa on public.journey_steps as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2') with check ((select auth.jwt() ->> 'aal') = 'aal2');

-- Today's wording from src/lib/journey.ts, with the starting deliverables (owner-approved).
insert into public.journey_steps (step, stage, day, title, how, channel, with_seo, say, ask, template, deliverable) values
  (1, 0, 0, 'Kickoff call', 'Call', 'call', false, 'Welcome them, explain how we work and the first two weeks, and say a heat map is coming in week 2.', 'Services, real service area, photos, Google and website access, who to contact, phrases to avoid.', null, 'baseline_audit'),
  (2, 0, 0, 'Day-1 recap', 'Text, after the call', 'text', false, 'Thanks, a short recap, and a reminder of what to send.', 'The items they promised on the call.', 'Hey [First name], it''s [Your name] with YO Marketing. Thanks for hopping on today, I enjoyed talking through [Business]. Quick recap: we''re getting started on your local SEO. Could you send over [the items we asked for] when you have a minute? I''ll text you in a couple of days with what we''ve started and the first pages.', 'none'),
  (3, 0, 2, 'First pages', 'Text (email if they prefer)', 'text', true, 'What we started (keywords, competitors), tips on reviews and photos, and the first two finished pages.', 'A look at the two pages, Google reviews, recent photos, anything still missing.', 'Hi [First name], quick update on [Business]: we''ve started your keyword and competitor research, and the first two pages are done: [links]. Could you take a look? Two things that help a lot right now: a few new Google reviews and some recent job photos.', 'pages_update'),
  (4, 0, 7, 'Week-1 check-in', 'Text or email', 'text', true, 'Check in, share two more finished pages, and say the first heat map is next.', 'Anything still outstanding, plus feedback on the pages so far.', 'Hi [First name], two more pages are live for [Business]: [links]. Your first heat map comes next week. Is there anything you''d like changed on the pages so far? And if you can, send over [missing items].', 'pages_update'),
  (5, 1, 14, 'First heat map', 'Email + report, offer a call', 'email', true, 'Where they were at kickoff vs what changed. Be honest if movement is small: two weeks is a starting picture.', 'Questions, and does the map match the area they really serve?', null, 'heat_map'),
  (6, 1, 14, 'Heat map heads-up', 'Text, same day', 'text', false, 'Let them know the heat map is in their inbox and offer to walk through it.', null, 'Hi [First name], your first heat map for [Business] just landed in your email. Happy to hop on a quick call and walk you through it.', 'none'),
  (7, 1, 21, 'Week-3 nudge', 'Text or email', 'text', false, 'A light progress check, plus a review or photo nudge if still needed. Don''t dump a new data pack.', 'Anything blocking us, new photos, offers or service changes.', null, 'review_photo_ask'),
  (8, 1, 29, 'Month-1 report', 'Email + monthly report', 'email', true, 'The month-1 SEO report with the updated heat map: where they were, what changed, what we did, what''s next.', 'Feedback, and what to prioritise next month.', null, 'monthly_report'),
  (9, 1, 29, 'Report headline', 'Text, same day', 'text', false, 'One headline from the report and an offer to walk through it.', null, 'Hi [First name], your month-1 report for [Business] is in your inbox. Headline: [one line]. Want me to walk you through it?', 'none'),
  (10, 2, 32, 'Month-2 check-in', 'Text', 'text', false, 'Friendly check-in: anything they need from us, anything new on their side?', null, null, 'none'),
  (11, 2, 33, 'Month-2 work plan', 'Email', 'email', true, 'This month''s plan: pages, Google Business Profile and other agreed work.', null, null, 'gbp_recs'),
  (12, 2, 45, '45-day check-in call', 'Call', 'call', false, 'Results so far, what''s next, any blockers.', 'Reviews and new job photos.', null, 'none'),
  (13, 2, 45, 'Call recap', 'Text, after the call', 'text', false, 'A short recap of the call and the next steps you agreed.', null, null, 'none'),
  (14, 2, 51, 'Mid-month snapshot', 'Email', 'email', true, 'Work finished so far. Only mention ranking or review changes that are real.', null, null, 'progress_update'),
  (15, 2, 52, 'Reviews and photos nudge', 'Text', 'text', false, 'A light nudge if reviews or photos are lagging; otherwise a short "we''re on track" note.', null, null, 'review_photo_ask'),
  (16, 2, 59, 'Month-2 report', 'Email + monthly report', 'email', true, 'The monthly SEO report and updated heat map.', null, null, 'monthly_report'),
  (17, 2, 59, 'Report headline', 'Text, same day', 'text', false, 'Report headline and an offer to walk through it.', null, null, 'none'),
  (18, 2, 61, 'Anything you need?', 'Email', 'email', false, 'A short "anything you need" note, or a deeper update if a page went live or a competitor moved.', null, null, 'none'),
  (19, 3, 63, 'Month-3 check-in', 'Text', 'text', false, 'Friendly check-in heading into the last stretch of the first 90 days.', null, null, 'none'),
  (20, 3, 64, 'Month-3 plan', 'Email', 'email', true, 'The month-3 plan, tied back to the heat map and report.', null, null, 'none'),
  (21, 3, 67, '60-day check-in call', 'Call', 'call', false, 'Progress, priorities, and anything they want changed.', null, null, 'none'),
  (22, 3, 67, 'Call recap', 'Text, after the call', 'text', false, 'A short recap of the call and next steps.', null, null, 'none'),
  (23, 3, 80, '90-day heads-up', 'Email', 'email', false, 'A progress update, and a heads-up that the 90-day report and a short survey are coming.', null, null, 'none'),
  (24, 4, 89, '90-day report', 'Email + report', 'email', true, 'The 90-day SEO report and heat map: where they started vs where they are now.', null, null, 'monthly_report'),
  (25, 4, 89, '90-day headline', 'Text, same day', 'text', false, 'Report headline, plus a heads-up that a short survey follows.', null, null, 'none'),
  (26, 4, 92, 'Survey', 'Email', 'email', false, 'Ask for the short survey (Growth → Surveys).', null, 'Hi [First name], it''s been 90 days working on [Business]''s SEO. Would you take two minutes to tell us how it''s going? [survey link] Your answers shape what we do next.', 'survey'),
  (27, 4, 97, 'Referral ask', 'Email or call', 'email', false, 'Ask for referrals, after the survey (or a few days later if they haven''t replied).', null, 'Hi [First name], thanks again for trusting us with [Business]. If you know another business owner who''d like more calls from Google, we''d love an introduction. We''ll take great care of them.', 'referral_ask'),
  (101, 5, 0, 'Monthly report', 'Email + monthly report', 'email', true, 'The monthly SEO report and heat map, then a one-line text headline.', null, null, 'monthly_report'),
  (102, 5, 0, 'Mid-month check-in', 'Text or call', 'text', false, 'A light check-in: anything new, anything they need, a review or photo nudge if useful.', null, null, 'none'),
  (103, 5, 0, 'Quarterly review', 'Call', 'call', true, 'Competitor review (if their tier has one) and upsell ideas: what would grow them next?', null, null, 'none');

-- ---------------------------------------------------------------------------
-- 2. clients.journey_placed_step (owner's "Place by start date")
-- ---------------------------------------------------------------------------
alter table public.clients
  add column journey_placed_step smallint check (journey_placed_step between 2 and 27),
  add constraint clients_placed_needs_start check (journey_placed_step is null or care_started_on is not null);
grant select (journey_placed_step) on public.clients to authenticated;
grant update (journey_placed_step) on public.clients to authenticated;
-- Managers and VAs can't change it: the client guard (0033) only lets them change the columns
-- it lists, and journey_placed_step isn't one of them. Developers and sales can't update clients.

-- A new journey start (restart, start onboarding) clears the placement, unless the same
-- update sets both (the owner's placement). Named "zz" so it runs AFTER clients_trash_guard
-- (same-event triggers run in name order): the guard checks what the person asked to change,
-- then this clears the old placement.
create function private.clients_journey_place_reset()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.care_started_on is distinct from old.care_started_on
     and new.journey_placed_step is not distinct from old.journey_placed_step then
    new.journey_placed_step := null;
  end if;
  return new;
end;
$$;
revoke execute on function private.clients_journey_place_reset() from public, anon, authenticated;
create trigger clients_zz_journey_place_reset before update on public.clients
  for each row execute function private.clients_journey_place_reset();

commit;

-- ---------------------------------------------------------------------------
-- UNDO (only if something is wrong; run as one block). Loses only step edits and placements
-- made after this ran; the app falls back to the wording in code.
--
-- begin;
-- drop trigger clients_zz_journey_place_reset on public.clients;
-- drop function private.clients_journey_place_reset();
-- alter table public.clients drop constraint clients_placed_needs_start;
-- alter table public.clients drop column journey_placed_step;
-- drop table public.journey_steps;
-- drop function private.journey_step_guard();
-- commit;
