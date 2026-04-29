-- Playoff brackets for leagues and tournaments.
-- Supports single elimination and (future) double elimination.
-- Multiple brackets per league enables per-division playoffs
-- feeding into a cross-division championship bracket.

create table public.brackets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  league_id uuid not null references public.leagues(id) on delete cascade,
  division_id uuid references public.divisions(id) on delete cascade,
  name text not null default 'Playoffs',
  bracket_type text not null default 'single_elimination'
    check (bracket_type in ('single_elimination', 'double_elimination')),
  seeding_method text not null default 'standings'
    check (seeding_method in ('standings', 'pool_results', 'manual')),
  bracket_size int not null default 8,  -- must be power of 2
  teams_advancing int not null default 8, -- actual teams (rest get byes)
  third_place_game boolean not null default false,
  status text not null default 'setup'
    check (status in ('setup', 'seeding', 'active', 'completed')),
  published_at timestamptz,
  created_at timestamptz default now()
);

-- Self-referencing match tree.
-- winner_to_match_id can reference a match in a different bracket (cross-div championship).
create table public.bracket_matches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  bracket_id uuid not null references public.brackets(id) on delete cascade,
  round_number int not null,   -- descending power-of-2: 4=quarters,2=semis,1=final
  match_number int not null,   -- 1-indexed position within round (for layout)
  team1_id uuid references public.teams(id),
  team2_id uuid references public.teams(id),
  team1_seed int,
  team2_seed int,
  is_bye boolean not null default false,
  winner_team_id uuid references public.teams(id),
  score1 int,
  score2 int,
  status text not null default 'pending'
    check (status in ('pending', 'ready', 'completed', 'bye')),
  winner_to_match_id uuid references public.bracket_matches(id),
  winner_to_slot int check (winner_to_slot in (1, 2)),
  loser_to_match_id uuid references public.bracket_matches(id),
  loser_to_slot int check (loser_to_slot in (1, 2)),
  game_id uuid references public.games(id),
  scheduled_at timestamptz,
  court text,
  notes text,
  created_at timestamptz default now(),
  unique(bracket_id, round_number, match_number)
);

-- RLS
alter table public.brackets enable row level security;
alter table public.bracket_matches enable row level security;

drop policy if exists "brackets_public_read" on public.brackets;
create policy "brackets_public_read" on public.brackets
  for select using (published_at is not null);

drop policy if exists "brackets_admin_all" on public.brackets;
create policy "brackets_admin_all" on public.brackets
  for all using (
    exists (
      select 1 from public.org_members
      where org_members.organization_id = brackets.organization_id
        and org_members.user_id = auth.uid()
        and org_members.role in ('org_admin', 'league_admin')
    )
  );

drop policy if exists "brackets_service_all" on public.brackets;
create policy "brackets_service_all" on public.brackets
  for all using (auth.role() = 'service_role');

drop policy if exists "bracket_matches_public_read" on public.bracket_matches;
create policy "bracket_matches_public_read" on public.bracket_matches
  for select using (
    exists (
      select 1 from public.brackets
      where brackets.id = bracket_matches.bracket_id
        and brackets.published_at is not null
    )
  );

drop policy if exists "bracket_matches_admin_all" on public.bracket_matches;
create policy "bracket_matches_admin_all" on public.bracket_matches
  for all using (
    exists (
      select 1 from public.org_members
      where org_members.organization_id = bracket_matches.organization_id
        and org_members.user_id = auth.uid()
        and org_members.role in ('org_admin', 'league_admin')
    )
  );

drop policy if exists "bracket_matches_service_all" on public.bracket_matches;
create policy "bracket_matches_service_all" on public.bracket_matches
  for all using (auth.role() = 'service_role');
