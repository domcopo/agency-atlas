-- Agency Atlas: require two-factor for every table.
--
-- Run ONCE in the Supabase SQL Editor, AFTER you have turned on two-factor in the
-- app (Settings are in docs/PHASE2_SETUP.md, step 7).
--
-- How it works: Supabase stamps every session with an "assurance level".
-- "aal1" = password only, "aal2" = password + authenticator code. These rules are
-- RESTRICTIVE, so they are added on top of the existing rules: a request needs
-- BOTH the normal role rule AND a two-factor session. A stolen password alone
-- then sees nothing, even if someone bypasses the app.

begin;

create policy team_requires_2fa on public.team_members as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

create policy clients_requires_2fa on public.clients as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

create policy staff_requires_2fa on public.staff as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

create policy check_ins_requires_2fa on public.check_ins as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

create policy atlas_requires_2fa on public.atlas_answers as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

commit;
