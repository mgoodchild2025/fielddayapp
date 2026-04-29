-- =============================================
-- Migration 013: Sport positions
-- =============================================

-- ── Table ─────────────────────────────────────────────────────────────────────

create table if not exists public.sport_positions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  sport           text not null,
  name            text not null,
  display_order   int  not null default 0,
  unique (organization_id, sport, name)
);

alter table public.sport_positions enable row level security;

-- Platform defaults readable by everyone
drop policy if exists "sport_positions_read" on public.sport_positions;
create policy "sport_positions_read"
  on public.sport_positions for select
  using (true);

-- Org admins can manage their own org's positions
drop policy if exists "sport_positions_org_admin_write" on public.sport_positions;
create policy "sport_positions_org_admin_write"
  on public.sport_positions for all
  using (
    organization_id is not null and
    exists (
      select 1 from public.org_members
      where org_members.organization_id = sport_positions.organization_id
        and org_members.user_id = auth.uid()
        and org_members.role in ('org_admin', 'league_admin')
    )
  );

-- ── Platform default positions ────────────────────────────────────────────────

insert into public.sport_positions (organization_id, sport, name, display_order) values
  -- Beach volleyball
  (null, 'beach_volleyball', 'Setter',        1),
  (null, 'beach_volleyball', 'Outside Hitter', 2),
  (null, 'beach_volleyball', 'Any',            3),
  -- Indoor volleyball
  (null, 'volleyball', 'Setter',         1),
  (null, 'volleyball', 'Libero',         2),
  (null, 'volleyball', 'Outside Hitter', 3),
  (null, 'volleyball', 'Right Side',     4),
  (null, 'volleyball', 'Middle Blocker', 5),
  -- Hockey
  (null, 'hockey', 'Goalie',     1),
  (null, 'hockey', 'Defence',    2),
  (null, 'hockey', 'Centre',     3),
  (null, 'hockey', 'Left Wing',  4),
  (null, 'hockey', 'Right Wing', 5),
  -- Basketball
  (null, 'basketball', 'Point Guard',    1),
  (null, 'basketball', 'Shooting Guard', 2),
  (null, 'basketball', 'Small Forward',  3),
  (null, 'basketball', 'Power Forward',  4),
  (null, 'basketball', 'Centre',         5),
  -- Soccer
  (null, 'soccer', 'Goalkeeper', 1),
  (null, 'soccer', 'Defender',   2),
  (null, 'soccer', 'Midfielder', 3),
  (null, 'soccer', 'Forward',    4),
  -- Baseball
  (null, 'baseball', 'Pitcher',      1),
  (null, 'baseball', 'Catcher',      2),
  (null, 'baseball', '1st Base',     3),
  (null, 'baseball', '2nd Base',     4),
  (null, 'baseball', '3rd Base',     5),
  (null, 'baseball', 'Shortstop',    6),
  (null, 'baseball', 'Left Field',   7),
  (null, 'baseball', 'Centre Field', 8),
  (null, 'baseball', 'Right Field',  9),
  -- Softball
  (null, 'softball', 'Pitcher',      1),
  (null, 'softball', 'Catcher',      2),
  (null, 'softball', '1st Base',     3),
  (null, 'softball', '2nd Base',     4),
  (null, 'softball', '3rd Base',     5),
  (null, 'softball', 'Shortstop',    6),
  (null, 'softball', 'Left Field',   7),
  (null, 'softball', 'Centre Field', 8),
  (null, 'softball', 'Right Field',  9),
  -- Football
  (null, 'football', 'Quarterback',    1),
  (null, 'football', 'Running Back',   2),
  (null, 'football', 'Wide Receiver',  3),
  (null, 'football', 'Tight End',      4),
  (null, 'football', 'Offensive Line', 5),
  (null, 'football', 'Linebacker',     6),
  (null, 'football', 'Cornerback',     7),
  (null, 'football', 'Safety',         8),
  (null, 'football', 'Kicker',         9),
  -- Ultimate frisbee
  (null, 'ultimate', 'Handler', 1),
  (null, 'ultimate', 'Cutter',  2),
  -- Rugby
  (null, 'rugby', 'Prop',      1),
  (null, 'rugby', 'Hooker',    2),
  (null, 'rugby', 'Lock',      3),
  (null, 'rugby', 'Flanker',   4),
  (null, 'rugby', 'Number 8',  5),
  (null, 'rugby', 'Scrum Half', 6),
  (null, 'rugby', 'Fly Half',  7),
  (null, 'rugby', 'Centre',    8),
  (null, 'rugby', 'Wing',      9),
  (null, 'rugby', 'Fullback',  10)
on conflict do nothing;

-- ── Add position columns ──────────────────────────────────────────────────────

alter table public.registrations
  add column if not exists position text;

alter table public.team_members
  add column if not exists position text;
