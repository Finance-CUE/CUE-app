-- Tie each profile row to its Supabase login account.
--
-- public.users had no foreign key to auth.users, so deleting a login account
-- left its profile behind - still holding the unique mobile number. The signup
-- route releases a number held by an abandoned, never-verified account by
-- deleting that login account; the leftover profile then blocked the number
-- for good ("already linked to a CUE account").
--
-- With the cascade, deleting a login account removes its profile and, through
-- the existing user_id cascades, all of that person's CUE data. That is also
-- what deleting an account should do.
--
-- Fails loudly if any profile has no login account; clean those up first.
-- Idempotent - safe to re-run. Run in the Supabase SQL editor or with psql.

do $$
begin
  if exists (
    select 1 from public.users p
    left join auth.users a on a.id = p.id
    where a.id is null
  ) then
    raise exception 'public.users has rows with no auth.users account; remove them before adding the foreign key';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.users'::regclass and conname = 'users_id_fkey'
  ) then
    alter table public.users
      add constraint users_id_fkey
      foreign key (id) references auth.users (id) on delete cascade;
  end if;
end
$$;
