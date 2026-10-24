-- Behavioural assessment: answers, results and the Q19 personalisation value.
--
-- The backend is the only reader and writer. It uses the secret key, which
-- bypasses RLS and keeps its own grants. Everything below exists so that a
-- client ever querying PostgREST directly gets nothing.
--
-- Run in the Supabase SQL editor. Idempotent - safe to re-run.

begin;

-- 0. Preflight ---------------------------------------------------------------

-- The backend writes archetype slugs such as 'comfort_spender'. If the column
-- were a Postgres enum those writes would fail at runtime, so fail here instead.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'users'
      and column_name = 'archetype' and data_type = 'USER-DEFINED'
  ) then
    raise exception 'public.users.archetype is an enum; convert it to text before running 004';
  end if;
end;
$$;


-- 1. Answers: one row per user per question, overwritten on re-answer --------

create table if not exists public.assessment_responses (
  user_id     uuid        not null references public.users (id) on delete cascade,
  question_id smallint    not null check (question_id between 1 and 18),
  response    smallint    not null check (response between 1 and 5),
  answered_at timestamptz not null default now(),
  primary key (user_id, question_id)
);


-- 2. Results: history is kept, the newest row wins ---------------------------

create table if not exists public.assessment_results (
  id                  uuid          primary key default gen_random_uuid(),
  user_id             uuid          not null references public.users (id) on delete cascade,
  present_bias        numeric(5, 2) not null check (present_bias between 0 and 100),
  future_orientation  numeric(5, 2) not null check (future_orientation between 0 and 100),
  identity            numeric(5, 2) not null check (identity between 0 and 100),
  financial_avoidance numeric(5, 2) not null check (financial_avoidance between 0 and 100),
  family_influence    numeric(5, 2) not null check (family_influence between 0 and 100),
  financial_agency    numeric(5, 2) not null check (financial_agency between 0 and 100),
  primary_archetype   text          not null,
  secondary_archetype text          not null,
  tertiary_archetype  text          not null,
  similarities        jsonb         not null,
  scoring_version     text          not null,
  computed_at         timestamptz   not null default now()
);

create index if not exists assessment_results_user_computed_idx
  on public.assessment_results (user_id, computed_at desc);


-- 3. Q19 personalisation value (never used in scoring) ------------------------

alter table public.users add column if not exists money_why text;

alter table public.users drop constraint if exists users_money_why_check;
alter table public.users add constraint users_money_why_check check (
  money_why is null or money_why in (
    'peace', 'freedom', 'stability', 'status', 'comfort',
    'excitement', 'belonging', 'control', 'possibility', 'security'
  )
);


-- 4. Lock both tables down -----------------------------------------------------

alter table public.assessment_responses enable row level security;
alter table public.assessment_results enable row level security;

drop policy if exists assessment_responses_select_own on public.assessment_responses;
create policy assessment_responses_select_own on public.assessment_responses
  for select using (auth.uid() = user_id);

drop policy if exists assessment_results_select_own on public.assessment_results;
create policy assessment_results_select_own on public.assessment_results
  for select using (auth.uid() = user_id);

-- No insert/update/delete policies exist, so RLS already denies writes. The
-- revokes remove the table from the PostgREST surface for anon and
-- authenticated entirely; the secret key keeps its own grants.
revoke all on table public.assessment_responses from anon, authenticated;
revoke all on table public.assessment_results from anon, authenticated;

-- 5. Stop clients writing their own profile -----------------------------------

-- 001 lets an authenticated user update their own public.users row through
-- PostgREST. Now that archetype, has_completed_assessment and money_why live
-- there, that would let a user forge their archetype with their own JWT. Only
-- the backend (secret key, own grants) writes profiles; reads stay via policy.
revoke update on table public.users from authenticated;

commit;
