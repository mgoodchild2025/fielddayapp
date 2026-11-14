-- Migration 203: event scorekeepers
-- Volunteers who enter scores for ONE event (tournament day) without any admin
-- access. Invited by email like co-organizers, but accepting never touches
-- org_members: a scorekeeper stays a player everywhere else.
-- The app reads and writes this table with the service role only.

create table if not exists public.event_scorekeepers (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  league_id       uuid not null references public.leagues(id) on delete cascade,
  user_id         uuid references public.profiles(id) on delete set null,
  invited_email   text not null,
  invited_by      uuid references public.profiles(id) on delete set null,
  status          text not null default 'pending'
                    check (status in ('pending', 'active', 'removed')),
  token           uuid not null default gen_random_uuid(),
  expires_at      timestamptz not null default (now() + interval '30 days'),
  created_at      timestamptz not null default now(),
  unique (league_id, invited_email)
);

create index if not exists event_scorekeepers_user_idx
  on public.event_scorekeepers (user_id, organization_id, status);
create unique index if not exists event_scorekeepers_token_idx
  on public.event_scorekeepers (token);

alter table public.event_scorekeepers enable row level security;

drop policy if exists "event_scorekeepers_service_all" on public.event_scorekeepers;
create policy "event_scorekeepers_service_all" on public.event_scorekeepers
  for all to service_role using (true) with check (true);

revoke all on public.event_scorekeepers from anon, authenticated;
