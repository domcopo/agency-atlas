-- Agency Atlas: client care extras (Step 1B+, approved 2026-11-24, docs/CLIENT_CARE_PLAN.md).
--
-- Run ONCE in the Supabase SQL Editor, after 0031_care_goals.sql. Check today's backup
-- first. Undo steps are at the end.
--
-- What this adds:
-- * client_care       – one row per client: "No texts" (they replied STOP), preferred channel,
--                       best times, and which week-1 intake items were received (and when).
--                       Only "received": never logins, files or passwords.
-- * care_escalations  – "Needs the owner": a one-line reason, who raised it, and when the
--                       owner resolved it. Also raised automatically when someone logs a
--                       "worse" mood on a VIP or top-tier client.
-- * notices           – the owner gets a 'needs_owner' notice for each (mutable as usual).
-- * Kit               – the client communication playbook and message templates as normal,
--                       editable Kit pages (managers can read them).
-- Nothing is deleted.

begin;

-- ---------------------------------------------------------------------------
-- 1. Contact preferences + week-1 intake
-- ---------------------------------------------------------------------------
-- Only the 10 known intake items may be ticked (keys must match INTAKE_ITEMS in src/lib/journey.ts).
create function private.intake_keys_ok(j jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(bool_and(k in ('services', 'service_area', 'brand', 'photos', 'gbp_access',
                                 'site_access', 'email_dns', 'past_ads', 'contact_pref', 'contacts')), true)
  from jsonb_object_keys(j) k
$$;
revoke all on function private.intake_keys_ok(jsonb) from public, anon;
grant execute on function private.intake_keys_ok(jsonb) to authenticated;

create table public.client_care (
  client_id         uuid primary key references public.clients (id) on delete cascade,
  no_texts          boolean not null default false,
  preferred_channel text check (preferred_channel in ('call', 'text', 'email', 'video')),
  best_times        text check (char_length(best_times) <= 80),
  -- {"photos": "2026-11-24", ...}: item key -> day received.
  intake            jsonb not null default '{}' check (
                      jsonb_typeof(intake) = 'object'
                      and pg_column_size(intake) <= 2000
                      and private.intake_keys_ok(intake)
                    ),
  updated_at        timestamptz not null default now(),
  updated_by        uuid references auth.users (id)
);
create trigger client_care_stamp before insert or update on public.client_care
  for each row execute function private.care_stamp();

revoke all on public.client_care from public, anon, authenticated;
grant select, insert on public.client_care to authenticated;
grant update (no_texts, preferred_channel, best_times, intake) on public.client_care to authenticated;
alter table public.client_care enable row level security;
create policy client_care_read on public.client_care for select to authenticated
  using ((select private.my_role()) in ('owner', 'manager'));
create policy client_care_add on public.client_care for insert to authenticated
  with check ((select private.my_role()) in ('owner', 'manager'));
create policy client_care_edit on public.client_care for update to authenticated
  using ((select private.my_role()) in ('owner', 'manager'))
  with check ((select private.my_role()) in ('owner', 'manager'));
create policy client_care_requires_2fa on public.client_care as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

-- ---------------------------------------------------------------------------
-- 2. "Needs the owner"
-- ---------------------------------------------------------------------------
create table public.care_escalations (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients (id) on delete cascade,
  reason      text not null check (char_length(btrim(reason)) between 1 and 200),
  automatic   boolean not null default false,
  raised_by   uuid references auth.users (id) default auth.uid(),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id)
);
create index care_escalations_open_idx on public.care_escalations (created_at desc) where resolved_at is null;

-- The database sets the time and who resolved it; nobody can rewrite a reason afterwards.
create function private.escalation_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.resolved_at := null;
    new.resolved_by := null;
  else
    new.client_id := old.client_id;
    new.reason := old.reason;
    new.automatic := old.automatic;
    new.raised_by := old.raised_by;
    new.created_at := old.created_at;
    if new.resolved_at is not null and old.resolved_at is null then
      new.resolved_at := now();
      new.resolved_by := (select auth.uid());
    elsif new.resolved_at is null then
      new.resolved_by := null;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.escalation_stamp() from public, anon;
create trigger care_escalations_stamp before insert or update on public.care_escalations
  for each row execute function private.escalation_stamp();

revoke all on public.care_escalations from public, anon, authenticated;
grant select, insert on public.care_escalations to authenticated;
grant update (resolved_at) on public.care_escalations to authenticated;
alter table public.care_escalations enable row level security;
create policy care_escalations_read on public.care_escalations for select to authenticated
  using ((select private.my_role()) in ('owner', 'manager'));
create policy care_escalations_add on public.care_escalations for insert to authenticated
  with check ((select private.my_role()) in ('owner', 'manager') and raised_by = (select auth.uid()) and automatic = false);
create policy care_escalations_resolve on public.care_escalations for update to authenticated
  using ((select private.my_role()) = 'owner')
  with check ((select private.my_role()) = 'owner');
create policy care_escalations_requires_2fa on public.care_escalations as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

-- ---------------------------------------------------------------------------
-- 3. Notices to the owner (button, and a "worse" mood on a VIP or top-tier client)
-- ---------------------------------------------------------------------------
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('assigned', 'unassigned', 'due_changed', 'comment', 'reassign_request', 'client_lost', 'needs_owner'));
alter table public.notification_settings drop constraint notification_settings_muted_check;
alter table public.notification_settings add constraint notification_settings_muted_check
  check (muted <@ array['assigned', 'unassigned', 'due_changed', 'comment', 'reassign_request', 'due_tomorrow', 'client_lost', 'needs_owner']::text[]);

create function private.notify_needs_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  client_name text;
begin
  select c.name into client_name from public.clients c where c.id = new.client_id;
  insert into public.notifications (user_id, kind, action_id, title, actor)
  select tm.user_id, 'needs_owner', null,
         left('Needs you: ' || coalesce(client_name, 'a client') || ' (' || new.reason || ')', 200),
         new.raised_by
  from public.team_members tm
  where tm.role = 'owner'
    and tm.user_id is distinct from new.raised_by
    and not exists (select 1 from public.notification_settings ns where ns.user_id = tm.user_id and 'needs_owner' = any (ns.muted));
  return new;
end;
$$;
revoke all on function private.notify_needs_owner() from public, anon, authenticated;
create trigger care_escalations_notify after insert on public.care_escalations
  for each row execute function private.notify_needs_owner();

-- A "worse" mood on a VIP or top-tier client raises one automatically (at most one open per client).
create function private.escalate_worse_mood()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.mood is distinct from 'worse' then
    return new;
  end if;
  if not exists (
       select 1 from public.clients c where c.id = new.client_id
         and (c.vip or exists (
           select 1 from public.client_plans cp join public.care_plans p on p.id = cp.plan_id
           where cp.client_id = c.id and p.top_tier
         ))
     ) then
    return new;
  end if;
  if exists (select 1 from public.care_escalations e where e.client_id = new.client_id and e.resolved_at is null) then
    return new;
  end if;
  insert into public.care_escalations (client_id, reason, automatic, raised_by)
  values (new.client_id, 'Important client logged as doing worse', true, (select auth.uid()));
  return new;
end;
$$;
revoke all on function private.escalate_worse_mood() from public, anon, authenticated;
create trigger check_ins_escalate_worse after insert on public.check_ins
  for each row execute function private.escalate_worse_mood();

-- ---------------------------------------------------------------------------
-- 4. Kit: the playbook and message templates (generic; edit them in the app)
-- ---------------------------------------------------------------------------
insert into public.kit_docs (kind, title, category, body, audience) values
(
  'sop',
  'Client communication playbook',
  'Client care',
  $p$# How we talk to clients

Every client's page in Atlas shows their journey and the **Next move**. Do the next move, send it from GoHighLevel, then tap **Done** in Atlas. Atlas never sends anything.

## Calls first
- Try to get them on the phone. A real conversation counts 3 toward your daily goal.
- No answer? Leave a voicemail **and** a text, then tap **Done → Call: no answer**. The touch comes back the next working day.
- After two missed calls, finish the touch by text or email: send the report, pictures or pages and a short note.

## The first 90 days
- **Week 1** is still for gathering info. Keep asking for what's missing (the checklist on the client page shows it).
- Capture the **baseline heat map** at or right after kickoff, so week 2 has something honest to compare.
- Show pages only when they are **really live**. If production is behind, say so.
- Every update ties back to the **SEO report and heat map**: where they were, what changed, what we did, what's next.

## House rules
- **Never invent numbers** (rankings, reviews, calls). If the map hasn't moved much, say that.
- If a client replies **STOP**: turn on **No texts** on their page, switch to email, and don't text again unless they clearly opt back in.
- Log every call, text, email and promise in GoHighLevel, and tap Done in Atlas.
- Unhappy client? Try to fix it first. If it isn't fixed, it's sensitive, or it's an important client, press **Needs the owner** on their page.
- After day 90: survey, then referral ask, then the monthly rhythm (report, mid-month check-in, quarterly review).
$p$,
  '{manager}'
),
(
  'template',
  'Day-1 recap text',
  'Client care',
  $t$Hey [First name], it's [Your name] with YO Marketing. Thanks for hopping on today, I enjoyed talking through [Business]. Quick recap: we're getting started on your local SEO. Could you send over [the items we asked for] when you have a minute? I'll text you in a couple of days with what we've started and the first pages.$t$,
  '{manager}'
),
(
  'template',
  'First pages update',
  'Client care',
  $t$Hi [First name], quick update on [Business]: we've started your keyword and competitor research, and the first two pages are done: [links]. Could you take a look? Two things that help a lot right now: a few new Google reviews and some recent job photos.$t$,
  '{manager}'
),
(
  'template',
  'Week-1 check-in',
  'Client care',
  $t$Hi [First name], two more pages are live for [Business]: [links]. Your first heat map comes next week. Is there anything you'd like changed on the pages so far? And if you can, send over [missing items].$t$,
  '{manager}'
),
(
  'template',
  'Heat map heads-up',
  'Client care',
  $t$Hi [First name], your first heat map for [Business] just landed in your email. Happy to hop on a quick call and walk you through it.$t$,
  '{manager}'
),
(
  'template',
  '90-day survey ask',
  'Client care',
  $t$Hi [First name], it's been 90 days working on [Business]'s SEO. Would you take two minutes to tell us how it's going? [survey link] Your answers shape what we do next.$t$,
  '{manager}'
),
(
  'template',
  'Referral ask',
  'Client care',
  $t$Hi [First name], thanks again for trusting us with [Business]. If you know another business owner who'd like more calls from Google, we'd love an introduction. We'll take great care of them.$t$,
  '{manager}'
);

commit;

-- ---------------------------------------------------------------------------
-- UNDO (only if something is wrong; one block in the SQL Editor). Removes the intake,
-- contact preferences and "Needs the owner" records written since. The Kit pages stay
-- (archive them in Kit if you don't want them).
--
-- begin;
-- drop trigger check_ins_escalate_worse on public.check_ins;
-- drop function private.escalate_worse_mood();
-- drop trigger care_escalations_notify on public.care_escalations;
-- drop function private.notify_needs_owner();
-- delete from public.notifications where kind = 'needs_owner';
-- update public.notification_settings set muted = array_remove(muted, 'needs_owner');
-- alter table public.notifications drop constraint notifications_kind_check;
-- alter table public.notifications add constraint notifications_kind_check
--   check (kind in ('assigned', 'unassigned', 'due_changed', 'comment', 'reassign_request', 'client_lost'));
-- alter table public.notification_settings drop constraint notification_settings_muted_check;
-- alter table public.notification_settings add constraint notification_settings_muted_check
--   check (muted <@ array['assigned', 'unassigned', 'due_changed', 'comment', 'reassign_request', 'due_tomorrow', 'client_lost']::text[]);
-- drop table public.care_escalations, public.client_care;
-- drop function private.escalation_stamp();
-- drop function private.intake_keys_ok(jsonb);
-- commit;
-- ---------------------------------------------------------------------------
