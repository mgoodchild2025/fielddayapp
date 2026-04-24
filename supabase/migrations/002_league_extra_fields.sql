-- =============================================
-- League extra fields: location, age group, organizer, join policy
-- =============================================

alter table public.leagues
  add column if not exists age_group text,
  add column if not exists venue_name text,
  add column if not exists venue_address text,
  add column if not exists venue_maps_url text,
  add column if not exists venue_type text check (venue_type in ('indoor', 'outdoor', 'both')),
  add column if not exists venue_surface text,
  add column if not exists organizer_name text,
  add column if not exists organizer_email text,
  add column if not exists organizer_phone text,
  add column if not exists max_participants integer,
  add column if not exists team_join_policy text not null default 'open'
    check (team_join_policy in ('open', 'captain_invite', 'admin_only'));

-- Add team_code to teams if missing
alter table public.teams
  add column if not exists team_code text unique;

-- Generate codes for existing teams without one
update public.teams
  set team_code = upper(substring(md5(id::text) for 6))
  where team_code is null;

-- =============================================
-- Announcements: add audience_type + team targeting
-- =============================================

alter table public.announcements
  add column if not exists audience_type text not null default 'org'
    check (audience_type in ('org', 'league', 'team')),
  add column if not exists team_id uuid references public.teams(id) on delete cascade;

create index if not exists announcements_org_idx
  on public.announcements(organization_id, created_at desc);

-- =============================================
-- Team join requests
-- =============================================

create table if not exists public.team_join_requests (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  message text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz default now(),
  unique(team_id, user_id)
);

create index if not exists team_join_requests_team_idx
  on public.team_join_requests(team_id, status);
create index if not exists team_join_requests_user_idx
  on public.team_join_requests(user_id);
