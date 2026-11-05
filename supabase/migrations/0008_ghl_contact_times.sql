-- Agency Atlas Phase 6: when each client was last called or messaged (TIMES ONLY).
--
-- Run ONCE in the Supabase SQL Editor (after 0001-0007).
--
-- What this adds (nothing existing is changed or deleted):
-- * ghl_contact_links – which GoHighLevel contact is which client. The sync
--   SUGGESTS matches by name; the owner confirms or rejects each one.
--   Stores only the contact's id and name (no email, phone or messages).
-- * ghl_contact_stats – per client: last time the client reached out, last time
--   we did, last call (and its length), the channel, and how many of our messages
--   in a row have had no reply. No message text, recordings or transcripts.
--
-- Rules: owner and managers read; only the owner syncs and confirms matches.
-- Developers and signed-out visitors see nothing. Nothing can be deleted.
-- Two-factor required, like every other table.

begin;

create table public.ghl_contact_links (
  client_id      uuid not null references public.clients (id) on delete restrict,
  ghl_contact_id text not null check (ghl_contact_id ~ '^[A-Za-z0-9]{6,40}$'),
  contact_name   text check (char_length(contact_name) <= 120),
  status         text not null default 'suggested' check (status in ('suggested', 'confirmed', 'rejected')),
  updated_at     timestamptz not null default now(),
  updated_by     uuid not null default auth.uid() references auth.users (id),
  primary key (client_id, ghl_contact_id)
);
-- At most one confirmed contact per client.
create unique index ghl_contact_links_one_confirmed on public.ghl_contact_links (client_id) where status = 'confirmed';

create table public.ghl_contact_stats (
  client_id           uuid primary key references public.clients (id) on delete restrict,
  ghl_contact_id      text not null check (ghl_contact_id ~ '^[A-Za-z0-9]{6,40}$'),
  last_inbound_at     timestamptz,
  last_outbound_at    timestamptz,
  last_call_at        timestamptz,
  last_call_seconds   integer check (last_call_seconds between 0 and 86400),
  last_channel        text check (last_channel in ('call', 'text', 'email', 'whatsapp', 'chat', 'other')),
  last_direction      text check (last_direction in ('inbound', 'outbound')),
  unanswered_outbound integer not null default 0 check (unanswered_outbound between 0 and 1000),
  synced_at           timestamptz not null default now()
);

revoke all on public.ghl_contact_links, public.ghl_contact_stats from public, anon, authenticated;
grant select, insert on public.ghl_contact_links to authenticated;
grant update (contact_name, status, updated_at, updated_by) on public.ghl_contact_links to authenticated;
grant select, insert on public.ghl_contact_stats to authenticated;
-- (client_id is included so the owner-only sync can "save or update" in one step.)
grant update (client_id, ghl_contact_id, last_inbound_at, last_outbound_at, last_call_at, last_call_seconds, last_channel, last_direction, unanswered_outbound, synced_at)
  on public.ghl_contact_stats to authenticated;

alter table public.ghl_contact_links enable row level security;
alter table public.ghl_contact_stats enable row level security;

create policy ghl_links_read on public.ghl_contact_links for select to authenticated
  using ((select private.my_role()) in ('owner', 'manager'));
create policy ghl_links_insert on public.ghl_contact_links for insert to authenticated
  with check ((select private.my_role()) = 'owner' and updated_by = (select auth.uid()));
create policy ghl_links_update on public.ghl_contact_links for update to authenticated
  using ((select private.my_role()) = 'owner')
  with check ((select private.my_role()) = 'owner' and updated_by = (select auth.uid()));

create policy ghl_stats_read on public.ghl_contact_stats for select to authenticated
  using ((select private.my_role()) in ('owner', 'manager'));
create policy ghl_stats_insert on public.ghl_contact_stats for insert to authenticated
  with check ((select private.my_role()) = 'owner');
create policy ghl_stats_update on public.ghl_contact_stats for update to authenticated
  using ((select private.my_role()) = 'owner')
  with check ((select private.my_role()) = 'owner');

create policy ghl_links_requires_2fa on public.ghl_contact_links as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');
create policy ghl_stats_requires_2fa on public.ghl_contact_stats as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

commit;
