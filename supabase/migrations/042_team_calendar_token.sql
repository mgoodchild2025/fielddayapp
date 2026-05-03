-- Add calendar_token to teams for .ics feed authentication.
-- Token is generated lazily on first subscribe request; old teams are unaffected.

alter table public.teams add column if not exists calendar_token uuid;

create index if not exists teams_calendar_token_idx
  on public.teams(calendar_token)
  where calendar_token is not null;
