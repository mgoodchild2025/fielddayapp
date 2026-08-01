-- Per-week schedule phases: lets admins declare which weeks are regular season,
-- pool play, or playoffs so players know the structure before matchups are set.

create table if not exists public.week_phases (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  league_id        uuid not null references public.leagues(id) on delete cascade,
  week_number      int not null,
  phase            text not null check (phase in ('regular_season', 'pool_play', 'playoffs')),
  created_at       timestamptz not null default now(),
  unique (league_id, week_number)
);

create index if not exists week_phases_league_id_idx on public.week_phases (league_id);

-- RLS -------------------------------------------------------------------
alter table public.week_phases enable row level security;

drop policy if exists "week_phases_read" on public.week_phases;
create policy "week_phases_read" on public.week_phases
  for select using (true);

drop policy if exists "week_phases_admin_write" on public.week_phases;
create policy "week_phases_admin_write" on public.week_phases
  for all using (
    exists (
      select 1 from public.org_members om
      where om.organization_id = week_phases.organization_id
        and om.user_id = auth.uid()
        and om.role in ('org_admin', 'league_admin')
    )
  );

drop policy if exists "week_phases_service_all" on public.week_phases;
create policy "week_phases_service_all" on public.week_phases
  for all using (auth.role() = 'service_role');
