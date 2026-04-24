-- =============================================
-- Org timezone support
-- =============================================

alter table public.org_branding
  add column if not exists timezone text not null default 'America/Toronto';

-- =============================================
-- Team join requests notifications helper
-- =============================================
-- (team_join_requests already added in 002)

-- Ensure team_members has no null user_id constraint issue
-- The user_id can be null for invited-but-not-registered players (already set in 001)
