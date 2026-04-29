-- =============================================
-- Migration 014: Event types
-- =============================================
-- The "leagues" table is renamed to "events" conceptually in the UI.
-- The DB table stays as `leagues` to avoid breaking FK chains.
-- This migration adds event_type to distinguish the four event formats.

alter table public.leagues
  add column if not exists event_type text not null default 'league'
  check (event_type in ('league', 'tournament', 'pickup', 'drop_in'));
