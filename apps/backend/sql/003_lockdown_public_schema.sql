-- Close the Supabase database linter findings on the public schema.
--
-- Everything here is about what PostgREST exposes at /rest/v1. The backend
-- talks to Supabase with the secret key, which bypasses RLS and holds its own
-- grants, so none of this changes how the API behaves.
--
-- Run in the Supabase SQL editor. Idempotent - safe to re-run.

begin;

-- 1. alembic_version: RLS disabled in public ---------------------------------

-- Alembic's bookkeeping table. It is not application data and nothing outside
-- a migration run should ever see it, but it sits in public, so PostgREST
-- publishes it. RLS with no policies denies every anon and authenticated read;
-- the secret key still bypasses, which is all Alembic needs.
do $$
begin
  if to_regclass('public.alembic_version') is not null then
    execute 'alter table public.alembic_version enable row level security';
    execute 'revoke all on table public.alembic_version from anon, authenticated';
  end if;
end;
$$;


-- 2. handle_new_user: callable over RPC --------------------------------------

-- Postgres grants EXECUTE on new functions to PUBLIC, so the signup trigger
-- also became a callable endpoint at /rest/v1/rpc/handle_new_user. It has to
-- stay SECURITY DEFINER - it writes public.users while running as the auth
-- system's role - so the fix is to take the grant away.
--
-- The trigger keeps firing: EXECUTE is checked when a trigger is created, not
-- each time it fires.
revoke all on function public.handle_new_user() from public, anon, authenticated;

commit;
