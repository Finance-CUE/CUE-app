-- Profile rows for CUE accounts.
--
-- Auth lives in Supabase's auth.users; public.users is the application profile.
-- A trigger keeps them in step so an account can never exist in auth without a
-- profile - the failure mode a post-signup write from the backend would have.
--
-- public.users predates Supabase Auth: it was built for a self-managed login
-- and still carried hashed_password plus rows with no auth.users counterpart.
-- Sections 1 and 2 retire that.
--
-- Run in the Supabase SQL editor. Idempotent - safe to re-run.

begin;

-- 1. Retire the self-managed auth columns -----------------------------------

-- Supabase owns credentials now. Nothing can supply this and it must not look
-- like a place passwords still live.
alter table public.users drop column if exists hashed_password;

-- The login identifier. Stored E.164 to match auth.users.raw_user_meta_data.
alter table public.users add column if not exists phone varchar(20);

create unique index if not exists users_phone_key on public.users (phone);


-- 2. Drop rows orphaned by the old auth system ------------------------------

-- Any profile with no auth.users counterpart cannot be signed into.
delete from public.users u
where not exists (select 1 from auth.users a where a.id = u.id);


-- 3. Keep profiles in step with auth.users ----------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
-- security definer runs as the owner, so pin search_path: without it a
-- caller-controlled path could resolve these names to their own objects.
set search_path = public
as $$
begin
  insert into public.users (
    id,
    email,
    full_name,
    phone,
    is_active,
    has_completed_assessment,
    archetype,
    created_at,
    updated_at
  )
  values (
    new.id,
    -- The real address from the signup form. auth.users.email holds the
    -- synthetic 91<phone>@phone.cue.invalid identifier, never this.
    new.raw_user_meta_data ->> 'contact_email',
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'phone',
    true,
    false,
    'unassessed',
    now(),
    now()
  )
  -- A retried signup must not abort account creation.
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- 4. Backfill accounts created before the trigger existed --------------------

insert into public.users (
  id, email, full_name, phone,
  is_active, has_completed_assessment, archetype, created_at, updated_at
)
select
  a.id,
  a.raw_user_meta_data ->> 'contact_email',
  a.raw_user_meta_data ->> 'full_name',
  a.raw_user_meta_data ->> 'phone',
  true,
  false,
  'unassessed',
  a.created_at,
  now()
from auth.users a
on conflict (id) do nothing;


-- 5. Lock the table down -----------------------------------------------------

-- The backend uses the secret key, which bypasses RLS, so this changes nothing
-- for the API. It is the guard for the day a client ever queries PostgREST.
alter table public.users enable row level security;

drop policy if exists users_select_own on public.users;
create policy users_select_own on public.users
  for select using (auth.uid() = id);

drop policy if exists users_update_own on public.users;
create policy users_update_own on public.users
  for update using (auth.uid() = id) with check (auth.uid() = id);

commit;
