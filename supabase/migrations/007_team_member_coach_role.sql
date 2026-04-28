-- Add 'coach' to the allowed roles for team members.
-- PostgreSQL requires dropping and re-creating the check constraint.

alter table public.team_members
  drop constraint if exists team_members_role_check;

alter table public.team_members
  add constraint team_members_role_check
  check (role in ('captain', 'coach', 'player', 'sub'));
