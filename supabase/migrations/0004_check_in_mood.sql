-- Agency Atlas: "How are they doing?" on each check-in.
--
-- Run ONCE in the Supabase SQL Editor (after 0001-0003).
--
-- Adds an optional mood to check-ins: better / same / worse. The app uses the
-- latest one to move the client's health score up or down. Existing rules still
-- apply: owner and managers log check-ins as themselves; nothing can be edited
-- or deleted afterwards.

begin;

alter table public.check_ins
  add column mood text check (mood in ('better', 'same', 'worse'));

commit;
