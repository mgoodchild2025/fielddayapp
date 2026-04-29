-- Add join policy for pickup/drop-in events
-- 'public'  = anyone can self-register for sessions
-- 'private' = admin invite only; self-join is blocked

alter table public.leagues
  add column if not exists pickup_join_policy text not null default 'public'
  check (pickup_join_policy in ('public', 'private'));
