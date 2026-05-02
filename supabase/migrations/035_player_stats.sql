-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 035: Player stats tracking
--
-- Adds:
--   stat_definitions  — sport stat catalog (platform defaults + org overrides)
--   player_game_stats — raw per-player per-game stat rows
--   leagues.stats_public — visibility toggle (members-only by default)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── leagues.stats_public ─────────────────────────────────────────────────────

alter table public.leagues
  add column if not exists stats_public boolean not null default false;

-- ── stat_definitions ─────────────────────────────────────────────────────────
-- organization_id = null  → platform default (visible to all orgs for that sport)
-- organization_id = <id>  → org override (replaces platform defaults for that sport)

create table if not exists public.stat_definitions (
  id              uuid    primary key default gen_random_uuid(),
  organization_id uuid    references public.organizations(id) on delete cascade,
  sport           text    not null,
  key             text    not null,      -- stable machine key: 'kills', 'goals', etc.
  label           text    not null,      -- display label: 'Kills', 'Goals', etc.
  data_type       text    not null default 'integer'
                    check (data_type in ('integer', 'decimal', 'boolean')),
  display_order   int     not null default 0,
  is_active       boolean not null default true,
  unique (organization_id, sport, key)
);

alter table public.stat_definitions enable row level security;

-- Anyone can read stat definitions (public catalog)
drop policy if exists "stat_defs_read" on public.stat_definitions;
create policy "stat_defs_read" on public.stat_definitions
  for select using (true);

-- Org admins can manage their own overrides
drop policy if exists "stat_defs_org_admin_write" on public.stat_definitions;
create policy "stat_defs_org_admin_write" on public.stat_definitions
  for all using (
    organization_id is not null
    and organization_id = (
      select current_setting('app.current_org_id', true)::uuid
    )
    and exists (
      select 1 from public.org_members
      where org_members.organization_id = stat_definitions.organization_id
        and org_members.user_id = auth.uid()
        and org_members.role in ('org_admin', 'league_admin')
        and org_members.status = 'active'
    )
  );

-- Service role has full access
drop policy if exists "stat_defs_service" on public.stat_definitions;
create policy "stat_defs_service" on public.stat_definitions
  for all using (auth.role() = 'service_role');

-- ── Platform default stat definitions ────────────────────────────────────────

insert into public.stat_definitions (organization_id, sport, key, label, display_order) values
  -- Volleyball (indoor)
  (null, 'volleyball', 'kills',    'Kills',   1),
  (null, 'volleyball', 'errors',   'Errors',  2),
  (null, 'volleyball', 'aces',     'Aces',    3),
  (null, 'volleyball', 'blocks',   'Blocks',  4),
  (null, 'volleyball', 'digs',     'Digs',    5),
  (null, 'volleyball', 'assists',  'Assists', 6),
  -- Beach volleyball
  (null, 'beach_volleyball', 'kills',   'Kills',  1),
  (null, 'beach_volleyball', 'errors',  'Errors', 2),
  (null, 'beach_volleyball', 'aces',    'Aces',   3),
  (null, 'beach_volleyball', 'blocks',  'Blocks', 4),
  (null, 'beach_volleyball', 'digs',    'Digs',   5),
  -- Soccer
  (null, 'soccer', 'goals',        'Goals',        1),
  (null, 'soccer', 'assists',      'Assists',       2),
  (null, 'soccer', 'saves',        'Saves',         3),
  (null, 'soccer', 'yellow_cards', 'Yellow Cards',  4),
  -- Basketball
  (null, 'basketball', 'points',   'Points',   1),
  (null, 'basketball', 'rebounds', 'Rebounds', 2),
  (null, 'basketball', 'assists',  'Assists',  3),
  (null, 'basketball', 'steals',   'Steals',   4),
  (null, 'basketball', 'blocks',   'Blocks',   5),
  -- Hockey
  (null, 'hockey', 'goals',    'Goals',    1),
  (null, 'hockey', 'assists',  'Assists',  2),
  (null, 'hockey', 'plus_minus', '+/-',   3),
  (null, 'hockey', 'pim',      'PIM',      4),
  (null, 'hockey', 'shots',    'Shots',    5),
  (null, 'hockey', 'saves',    'Saves',    6),
  -- Softball / Baseball
  (null, 'softball', 'hits', 'Hits', 1),
  (null, 'softball', 'runs', 'Runs', 2),
  (null, 'softball', 'rbis', 'RBIs', 3),
  (null, 'baseball', 'hits', 'Hits', 1),
  (null, 'baseball', 'runs', 'Runs', 2),
  (null, 'baseball', 'rbis', 'RBIs', 3)
on conflict do nothing;

-- ── player_game_stats ─────────────────────────────────────────────────────────
-- One row per (game, player, stat_key). Upsert on the unique constraint.
-- league_id is denormalised for efficient season-aggregate queries.

create table if not exists public.player_game_stats (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  league_id       uuid        not null references public.leagues(id) on delete cascade,
  game_id         uuid        not null references public.games(id) on delete cascade,
  team_id         uuid        not null references public.teams(id) on delete cascade,
  user_id         uuid        not null references public.profiles(id) on delete cascade,
  stat_key        text        not null,   -- text, not FK — decoupled from definition changes
  value           numeric     not null default 0,
  entered_by      uuid        references public.profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (game_id, user_id, stat_key)
);

-- Indexes for common access patterns
create index if not exists player_game_stats_league_idx
  on public.player_game_stats (organization_id, league_id, stat_key, user_id);

create index if not exists player_game_stats_game_idx
  on public.player_game_stats (game_id, team_id);

alter table public.player_game_stats enable row level security;

-- Read: authenticated members of the org, OR public if league has stats_public = true
drop policy if exists "player_stats_read" on public.player_game_stats;
create policy "player_stats_read" on public.player_game_stats
  for select using (
    organization_id = (
      select current_setting('app.current_org_id', true)::uuid
    )
    and (
      -- Always readable by authenticated org members
      auth.uid() is not null
      -- Readable by anyone (including unauthenticated) when org admin has enabled public stats
      or exists (
        select 1 from public.leagues
        where leagues.id = player_game_stats.league_id
          and leagues.stats_public = true
      )
    )
  );

-- Write: org/league admins can write stats for any team
drop policy if exists "player_stats_admin_write" on public.player_game_stats;
create policy "player_stats_admin_write" on public.player_game_stats
  for all using (
    organization_id = (
      select current_setting('app.current_org_id', true)::uuid
    )
    and exists (
      select 1 from public.org_members
      where org_members.organization_id = player_game_stats.organization_id
        and org_members.user_id = auth.uid()
        and org_members.role in ('org_admin', 'league_admin')
        and org_members.status = 'active'
    )
  );

-- Write: captains can write stats only for their own team
drop policy if exists "player_stats_captain_write" on public.player_game_stats;
create policy "player_stats_captain_write" on public.player_game_stats
  for insert with check (
    organization_id = (
      select current_setting('app.current_org_id', true)::uuid
    )
    and exists (
      select 1 from public.team_members
      where team_members.team_id = player_game_stats.team_id
        and team_members.user_id = auth.uid()
        and team_members.role = 'captain'
    )
  );

-- Captains can also update their own team's stats
drop policy if exists "player_stats_captain_update" on public.player_game_stats;
create policy "player_stats_captain_update" on public.player_game_stats
  for update using (
    organization_id = (
      select current_setting('app.current_org_id', true)::uuid
    )
    and exists (
      select 1 from public.team_members
      where team_members.team_id = player_game_stats.team_id
        and team_members.user_id = auth.uid()
        and team_members.role = 'captain'
    )
  );

-- League organizers can write stats for their event
drop policy if exists "player_stats_organizer_write" on public.player_game_stats;
create policy "player_stats_organizer_write" on public.player_game_stats
  for all using (
    organization_id = (
      select current_setting('app.current_org_id', true)::uuid
    )
    and exists (
      select 1 from public.league_organizers
      where league_organizers.league_id = player_game_stats.league_id
        and league_organizers.user_id = auth.uid()
        and league_organizers.status = 'active'
    )
  );

-- Service role full access
drop policy if exists "player_stats_service" on public.player_game_stats;
create policy "player_stats_service" on public.player_game_stats
  for all using (auth.role() = 'service_role');
