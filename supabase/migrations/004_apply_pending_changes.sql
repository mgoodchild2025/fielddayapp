-- =============================================
-- Migration 004: Apply all pending schema changes
-- Run this in the Supabase SQL Editor:
--   https://supabase.com/dashboard/project/orjczrkpqkizvowvqlyv/sql/new
--
-- All ALTER TABLE statements use IF NOT EXISTS so they are safe to re-run.
-- =============================================

-- ── Leagues: extra fields ────────────────────────────────────────────────────

alter table public.leagues
  add column if not exists age_group text,
  add column if not exists venue_name text,
  add column if not exists venue_address text,
  add column if not exists venue_maps_url text,
  add column if not exists venue_type text,
  add column if not exists venue_surface text,
  add column if not exists organizer_name text,
  add column if not exists organizer_email text,
  add column if not exists organizer_phone text,
  add column if not exists max_participants integer,
  add column if not exists team_join_policy text not null default 'open';

-- Add check constraints separately so they don't error if column already exists
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'leagues_venue_type_check'
  ) then
    alter table public.leagues
      add constraint leagues_venue_type_check check (venue_type in ('indoor', 'outdoor', 'both'));
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'leagues_team_join_policy_check'
  ) then
    alter table public.leagues
      add constraint leagues_team_join_policy_check
        check (team_join_policy in ('open', 'captain_invite', 'admin_only'));
  end if;
end $$;

-- ── Teams: join code ─────────────────────────────────────────────────────────

alter table public.teams
  add column if not exists team_code text;

-- Add unique constraint if not already present
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'teams_team_code_key'
  ) then
    alter table public.teams add constraint teams_team_code_key unique (team_code);
  end if;
end $$;

-- Generate codes for existing teams that don't have one yet
update public.teams
  set team_code = upper(substring(md5(id::text) for 6))
  where team_code is null;

-- ── Announcements: audience targeting ───────────────────────────────────────

alter table public.announcements
  add column if not exists audience_type text not null default 'org',
  add column if not exists team_id uuid;

-- Add FK if not already present
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'announcements_team_id_fkey'
  ) then
    alter table public.announcements
      add constraint announcements_team_id_fkey
        foreign key (team_id) references public.teams(id) on delete cascade;
  end if;
end $$;

-- Add check constraint if not already present
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'announcements_audience_type_check'
  ) then
    alter table public.announcements
      add constraint announcements_audience_type_check
        check (audience_type in ('org', 'league', 'team'));
  end if;
end $$;

create index if not exists announcements_org_idx
  on public.announcements(organization_id, created_at desc);

-- ── Team join requests ───────────────────────────────────────────────────────

create table if not exists public.team_join_requests (
  id              uuid        primary key default gen_random_uuid(),
  team_id         uuid        not null references public.teams(id) on delete cascade,
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  user_id         uuid        not null references public.profiles(id) on delete cascade,
  status          text        not null default 'pending'
                    check (status in ('pending', 'approved', 'rejected')),
  message         text,
  reviewed_by     uuid        references public.profiles(id),
  reviewed_at     timestamptz,
  created_at      timestamptz default now(),
  unique(team_id, user_id)
);

create index if not exists team_join_requests_team_idx
  on public.team_join_requests(team_id, status);
create index if not exists team_join_requests_user_idx
  on public.team_join_requests(user_id);

-- RLS for team_join_requests
alter table public.team_join_requests enable row level security;

-- Drop and recreate policies (CREATE POLICY has no IF NOT EXISTS)
drop policy if exists "join_requests_self_read"   on public.team_join_requests;
drop policy if exists "join_requests_self_insert"  on public.team_join_requests;
drop policy if exists "join_requests_service_all"  on public.team_join_requests;

create policy "join_requests_self_read"
  on public.team_join_requests for select
  using (user_id = auth.uid());

create policy "join_requests_self_insert"
  on public.team_join_requests for insert
  with check (user_id = auth.uid());

create policy "join_requests_service_all"
  on public.team_join_requests for all
  using (auth.role() = 'service_role');

-- ── Org branding: timezone ───────────────────────────────────────────────────

alter table public.org_branding
  add column if not exists timezone text not null default 'America/Toronto';
