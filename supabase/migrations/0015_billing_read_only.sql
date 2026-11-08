-- Agency Atlas: billing, READ-ONLY, OWNER ONLY (docs/BILLING_PLAN.md).
--
-- Run ONCE in the Supabase SQL Editor (after 0001-0014).
--
-- What this adds (nothing existing changes):
-- * billing_records          – a minimal copy of GoHighLevel invoices and payments:
--                              client, amounts, currency, status, dates, provider ID.
--                              NO card/bank details, emails, phones, addresses, notes or items.
-- * billing_contact_matches  – which GoHighLevel contact belongs to which client, matched
--                              BY HAND by the owner (no guessing).
-- * billing_syncs            – every billing refresh (success or failure), with a
--                              10-minute limit enforced by the database.
-- * activity kind 'billing_sync' – a line in the history with counts only, never money
--                              (managers can read the history).
--
-- Rules:
-- * OWNER ONLY. Managers and developers read nothing from these tables (row-level
--   security, tested). Signed-out visitors have no permission at all.
-- * No deletes for anyone. Two-factor required on every table.
-- * Atlas only READS GoHighLevel; it never creates, changes, voids or sends invoices,
--   and never charges, refunds or reminds anyone.

begin;

-- 1. Invoices and payments (minimum fields) ------------------------------------------
create table public.billing_records (
  id                  uuid primary key default gen_random_uuid(),
  provider            text not null default 'ghl' check (provider in ('ghl')),
  kind                text not null check (kind in ('invoice', 'payment')),
  provider_id         text not null check (provider_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  -- GoHighLevel contact ID (letters and numbers only): used to match a client. Not a name.
  provider_contact_id text check (provider_contact_id ~ '^[A-Za-z0-9]{6,40}$'),
  client_id           uuid references public.clients (id) on delete restrict,
  -- Name as written on the invoice, ONLY while unmatched (so the owner can match it).
  unmatched_label     text check (
                        char_length(unmatched_label) between 1 and 80
                        and unmatched_label !~ '[^\s@]+@[^\s@]+\.[^\s@]+'
                        and unmatched_label !~ '\d[\d\s().-]{6,}\d'
                      ),
  amount_cents        bigint not null check (amount_cents between 0 and 100000000),
  amount_due_cents    bigint check (amount_due_cents between 0 and 100000000),
  currency            text not null check (currency ~ '^[A-Z]{3}$'),
  status              text not null check (status in ('paid', 'open', 'overdue', 'failed', 'refunded')),
  issued_on           date,
  due_on              date,
  paid_on             date,
  synced_at           timestamptz not null default now(),
  unique (provider, kind, provider_id),
  -- Once matched, the name is gone: the database refuses to keep both.
  constraint billing_label_only_unmatched check (client_id is null or unmatched_label is null)
);
-- A refresh re-saves each record by its provider ID; the ID itself can never change.
create function private.billing_keep_ids()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.provider is distinct from old.provider or new.kind is distinct from old.kind
     or new.provider_id is distinct from old.provider_id then
    raise exception 'a billing record''s provider ID cannot change' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;
revoke execute on function private.billing_keep_ids() from public, anon;
create trigger billing_records_keep_ids before update on public.billing_records
  for each row execute function private.billing_keep_ids();

create index billing_records_client_idx on public.billing_records (client_id, kind, status);
create index billing_records_contact_idx on public.billing_records (provider_contact_id) where client_id is null;

-- 2. Hand matches: GoHighLevel contact -> client ------------------------------------
create table public.billing_contact_matches (
  provider_contact_id text primary key check (provider_contact_id ~ '^[A-Za-z0-9]{6,40}$'),
  client_id           uuid not null references public.clients (id) on delete restrict,
  matched_by          uuid not null default auth.uid() references auth.users (id),
  matched_at          timestamptz not null default now()
);

-- 3. Sync history + rate limit ------------------------------------------------------
create table public.billing_syncs (
  id            uuid primary key default gen_random_uuid(),
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  ok            boolean,
  invoices_read integer check (invoices_read between 0 and 100000),
  payments_read integer check (payments_read between 0 and 100000),
  unmatched     integer check (unmatched between 0 and 100000),
  error_code    text check (error_code ~ '^[a-z0-9_]{1,40}$'),
  started_by    uuid not null default auth.uid() references auth.users (id)
);
create index billing_syncs_started_idx on public.billing_syncs (started_at desc);

-- At most one refresh every 10 minutes, whatever the app does. The time is the
-- database's own (nobody can backdate a refresh to get around the limit).
create function private.billing_sync_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select private.my_role()) is distinct from 'owner' then
    raise exception 'only the owner can refresh billing' using errcode = 'insufficient_privilege';
  end if;
  new.started_at := now();
  if exists (select 1 from public.billing_syncs where started_at > now() - interval '10 minutes') then
    raise exception 'billing was refreshed less than 10 minutes ago' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke execute on function private.billing_sync_limit() from public, anon, authenticated;
create trigger billing_syncs_limit before insert on public.billing_syncs
  for each row execute function private.billing_sync_limit();

-- 4. Permissions: start from nothing, then the owner only (no deletes) ---------------
revoke all on public.billing_records, public.billing_contact_matches, public.billing_syncs from public, anon, authenticated;
grant select, insert on public.billing_records to authenticated;
grant update (provider, kind, provider_id, provider_contact_id, client_id, unmatched_label, amount_cents, amount_due_cents, currency, status,
              issued_on, due_on, paid_on, synced_at)
  on public.billing_records to authenticated;
grant select, insert on public.billing_contact_matches to authenticated;
grant update (client_id) on public.billing_contact_matches to authenticated;
grant select, insert on public.billing_syncs to authenticated;
grant update (finished_at, ok, invoices_read, payments_read, unmatched, error_code) on public.billing_syncs to authenticated;

alter table public.billing_records         enable row level security;
alter table public.billing_contact_matches enable row level security;
alter table public.billing_syncs           enable row level security;

create policy billing_records_owner on public.billing_records for all to authenticated
  using ((select private.my_role()) = 'owner')
  with check ((select private.my_role()) = 'owner');
create policy billing_matches_owner on public.billing_contact_matches for all to authenticated
  using ((select private.my_role()) = 'owner')
  with check ((select private.my_role()) = 'owner' and matched_by = (select auth.uid()));
create policy billing_syncs_owner on public.billing_syncs for all to authenticated
  using ((select private.my_role()) = 'owner')
  with check ((select private.my_role()) = 'owner' and started_by = (select auth.uid()));

-- Two-factor on every table, like everywhere else.
create policy billing_records_requires_2fa on public.billing_records as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2') with check ((select auth.jwt() ->> 'aal') = 'aal2');
create policy billing_matches_requires_2fa on public.billing_contact_matches as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2') with check ((select auth.jwt() ->> 'aal') = 'aal2');
create policy billing_syncs_requires_2fa on public.billing_syncs as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2') with check ((select auth.jwt() ->> 'aal') = 'aal2');

-- 5. History line for each refresh (counts only, never money) -------------------------
alter table public.activity drop constraint activity_kind_check;
alter table public.activity add constraint activity_kind_check check (kind in (
  'action_created', 'action_done', 'action_reopened', 'action_rescheduled',
  'action_assigned', 'action_status', 'owner_changed', 'billing_sync'));
-- Billing lines carry no money: no dollar sign anywhere in the summary.
alter table public.activity add constraint activity_billing_no_money
  check (kind <> 'billing_sync' or (summary !~ '\$' and client_id is null and action_id is null));

commit;
