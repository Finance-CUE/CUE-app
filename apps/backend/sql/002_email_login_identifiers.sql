-- Move existing accounts from phone-derived login identifiers to real emails.
--
-- Accounts created before email login used a synthetic auth.users.email of the
-- form 91<phone>@phone.cue.invalid, with the real address held in
-- raw_user_meta_data ->> 'contact_email'. Login now sends the real address, so
-- those rows have to be swapped over or their owners can never sign in again.
--
-- Passwords are untouched: the hash lives in encrypted_password, not in email.
--
-- Run in the Supabase SQL editor. Idempotent - safe to re-run.

begin;

-- Guard: two synthetic accounts sharing one contact_email would collide with
-- auth.users' unique index on email. Fail loudly rather than half-migrate.
do $$
declare
  duplicates int;
begin
  select count(*) into duplicates
  from (
    select lower(raw_user_meta_data ->> 'contact_email') as address
    from auth.users
    where email like '%@phone.cue.invalid'
      and nullif(raw_user_meta_data ->> 'contact_email', '') is not null
    group by 1
    having count(*) > 1
  ) collisions;

  if duplicates > 0 then
    raise exception
      'Cannot migrate: % contact_email value(s) are shared by more than one account.',
      duplicates;
  end if;
end;
$$;

update auth.users
set
  email = lower(raw_user_meta_data ->> 'contact_email'),
  -- The address was collected at signup and never confirmed by mail; keep it
  -- usable rather than locking every existing account out behind a round-trip.
  email_confirmed_at = coalesce(email_confirmed_at, now()),
  raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object('signup_method', 'email_password'),
  updated_at = now()
where email like '%@phone.cue.invalid'
  and nullif(raw_user_meta_data ->> 'contact_email', '') is not null
  -- Do not clobber an account that already sits on its real address.
  and not exists (
    select 1 from auth.users other
    where other.id <> auth.users.id
      and lower(other.email) = lower(auth.users.raw_user_meta_data ->> 'contact_email')
  );

-- auth.identities carries its own copy of the email for the 'email' provider.
update auth.identities i
set
  identity_data = i.identity_data || jsonb_build_object('email', u.email),
  updated_at = now()
from auth.users u
where i.user_id = u.id
  and i.provider = 'email'
  and i.identity_data ->> 'email' like '%@phone.cue.invalid';

-- Anything left is an account with no usable address. Report, do not delete.
do $$
declare
  stranded int;
begin
  select count(*) into stranded
  from auth.users
  where email like '%@phone.cue.invalid';

  if stranded > 0 then
    raise notice
      '% account(s) still on a synthetic identifier - no contact_email to migrate to.',
      stranded;
  end if;
end;
$$;

commit;
