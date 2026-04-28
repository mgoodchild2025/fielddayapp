-- Team invitations: when a captain/coach/admin invites a player by email.
-- Players must accept before being added to the team.

create table public.team_invitations (
  id              uuid primary key default gen_random_uuid(),
  team_id         uuid not null references public.teams(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invited_email   text not null,
  invited_user_id uuid references auth.users(id) on delete set null,
  invited_by      uuid not null references auth.users(id) on delete cascade,
  role            text not null default 'player',
  status          text not null default 'pending',
  token           uuid not null default gen_random_uuid(),
  expires_at      timestamptz not null default (now() + interval '7 days'),
  created_at      timestamptz not null default now(),
  constraint team_invitations_role_check check (role in ('captain', 'coach', 'player', 'sub')),
  constraint team_invitations_status_check check (status in ('pending', 'accepted', 'declined', 'expired'))
);

-- Only one pending invite per email per team at a time
create unique index team_invitations_pending_unique
  on public.team_invitations(team_id, lower(invited_email))
  where status = 'pending';

alter table public.team_invitations enable row level security;
-- All access goes through server actions using service role, which bypasses RLS.
