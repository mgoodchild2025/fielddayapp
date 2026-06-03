-- Add calendar_token to leagues for the event .ics subscription feed.
-- Token is generated lazily on first subscribe-eligible view; old events are unaffected.
-- Mirrors teams.calendar_token (migration 042).

alter table public.leagues add column if not exists calendar_token uuid;

create index if not exists leagues_calendar_token_idx
  on public.leagues(calendar_token)
  where calendar_token is not null;
