-- Pools for tournament events (group-stage play before bracket)

create table public.pools (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  league_id        uuid not null references public.leagues(id) on delete cascade,
  name             text not null,
  sort_order       int not null default 0,
  created_at       timestamptz not null default now()
);

create index on public.pools (league_id);

alter table public.teams
  add column if not exists pool_id uuid references public.pools(id) on delete set null;

alter table public.games
  add column if not exists pool_id uuid references public.pools(id) on delete set null;

-- RLS ------------------------------------------------------------------
alter table public.pools enable row level security;

drop policy if exists "pools_read" on public.pools;
create policy "pools_read" on public.pools
  for select using (true);

drop policy if exists "pools_admin_write" on public.pools;
create policy "pools_admin_write" on public.pools
  for all using (
    exists (
      select 1 from public.org_members om
      where om.organization_id = pools.organization_id
        and om.user_id = auth.uid()
        and om.role in ('org_admin', 'league_admin')
    )
  );

drop policy if exists "pools_service_all" on public.pools;
create policy "pools_service_all" on public.pools
  for all using (auth.role() = 'service_role');
