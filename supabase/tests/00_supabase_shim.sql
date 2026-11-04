-- LOCAL TESTS ONLY. Never run this on the real project.
--
-- Recreates the small parts of Supabase that our security rules depend on, inside
-- a plain throwaway Postgres container:
--   * the "anon" (signed out) and "authenticated" (signed in) roles
--   * auth.users and auth.uid() (who is signed in, read from the request's token)
--   * Supabase's permissive defaults: new tables in "public" are granted to anon and
--     authenticated automatically. Our migration must undo that, and the tests prove it.

create role anon nologin;
create role authenticated nologin;
grant usage on schema public to anon, authenticated;

alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;

create schema auth;
grant usage on schema auth to anon, authenticated;
create table auth.users (id uuid primary key, email text);

create function auth.uid() returns uuid
language sql stable
as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
$$;
grant execute on function auth.uid() to anon, authenticated;

-- auth.jwt(): the whole sign-in token (we read its "aal" two-factor level).
create function auth.jwt() returns jsonb
language sql stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
grant execute on function auth.jwt() to anon, authenticated;
