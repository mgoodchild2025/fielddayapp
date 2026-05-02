-- Migration 038: Per-session check-in fields on session_registrations
-- Allows admins to check players in per-session (drop_in / pickup events).
-- Also adds a walk_in flag so walk-ins can be distinguished from pre-registered players.

ALTER TABLE public.session_registrations
  ADD COLUMN IF NOT EXISTS checked_in_at  timestamptz,
  ADD COLUMN IF NOT EXISTS checked_in_by  uuid references auth.users(id),
  ADD COLUMN IF NOT EXISTS is_walk_in     boolean not null default false;
