-- Profile rows for Google sign-ups.
--
-- handle_new_user copied the profile from email-signup metadata only
-- (contact_email, full_name, phone). A Google user has none of those keys:
-- Supabase puts the address in auth.users.email and the name in `full_name`
-- or `name`. Without this, their profile row would have no email or name.
--
-- Phone stays null for Google users until they add it in the app; the unique
-- index on public.users.phone allows any number of nulls.
--
-- Existing rows are untouched. Run in the Supabase SQL editor or with psql.
-- Idempotent - safe to re-run.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
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
    -- Email signups send the typed address as contact_email; Google only has
    -- the account address.
    lower(coalesce(nullif(new.raw_user_meta_data ->> 'contact_email', ''), new.email)),
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', '')
    ),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
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
$function$;
