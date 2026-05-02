-- Players can indicate availability (IN / OUT) for upcoming games on their team.

create table public.game_rsvps (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  game_id         uuid not null references public.games(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  team_id         uuid not null references public.teams(id) on delete cascade,
  status          text not null check (status in ('in', 'out')),
  note            text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  unique (game_id, user_id)
);

comment on table public.game_rsvps is
  'Per-player availability for a scheduled game. One row per (game, player).';

alter table public.game_rsvps enable row level security;

-- Any authenticated user can read RSVPs (captains need to see teammate counts)
drop policy if exists "game_rsvps_read" on public.game_rsvps;
create policy "game_rsvps_read" on public.game_rsvps
  for select using (auth.uid() is not null);

-- Players may insert/update their own RSVPs only
drop policy if exists "game_rsvps_own_insert" on public.game_rsvps;
create policy "game_rsvps_own_insert" on public.game_rsvps
  for insert with check (user_id = auth.uid()::uuid);

drop policy if exists "game_rsvps_own_update" on public.game_rsvps;
create policy "game_rsvps_own_update" on public.game_rsvps
  for update using (user_id = auth.uid()::uuid);

drop policy if exists "game_rsvps_own_delete" on public.game_rsvps;
create policy "game_rsvps_own_delete" on public.game_rsvps
  for delete using (user_id = auth.uid()::uuid);

-- Service role bypass
drop policy if exists "game_rsvps_service_all" on public.game_rsvps;
create policy "game_rsvps_service_all" on public.game_rsvps
  for all using (auth.role() = 'service_role');
