-- Migration: league_organizers
-- Tracks per-event co-organizer assignments with token-based invite flow.

create table public.league_organizers (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  league_id       uuid not null references public.leagues(id) on delete cascade,
  user_id         uuid references public.profiles(id) on delete set null,
  invited_email   text not null,
  invited_by      uuid not null references public.profiles(id) on delete cascade,
  status          text not null default 'pending'
                    check (status in ('pending', 'active', 'declined', 'removed')),
  token           uuid not null default gen_random_uuid(),
  expires_at      timestamptz not null default (now() + interval '7 days'),
  created_at      timestamptz not null default now(),
  unique(league_id, invited_email)
);

-- Indexes
create index league_organizers_league_id_idx on public.league_organizers(league_id);
create index league_organizers_user_id_idx on public.league_organizers(user_id);
create index league_organizers_token_idx on public.league_organizers(token);

-- RLS
alter table public.league_organizers enable row level security;

-- Org admins and league_admins can read organizers for their org
drop policy if exists "league_organizers_read" on public.league_organizers;
create policy "league_organizers_read" on public.league_organizers
  for select using (
    organization_id = (
      select current_setting('app.current_org_id', true)::uuid
    )
    and exists (
      select 1 from public.org_members
      where org_members.organization_id = league_organizers.organization_id
        and org_members.user_id = auth.uid()
        and org_members.role in ('org_admin', 'league_admin')
        and org_members.status = 'active'
    )
  );

-- Users can read their own invite row (to view invite details before accepting)
drop policy if exists "league_organizers_read_own" on public.league_organizers;
create policy "league_organizers_read_own" on public.league_organizers
  for select using (
    user_id = auth.uid()
  );

-- Only org_admin can insert/update/delete
drop policy if exists "league_organizers_admin_write" on public.league_organizers;
create policy "league_organizers_admin_write" on public.league_organizers
  for all using (
    organization_id = (
      select current_setting('app.current_org_id', true)::uuid
    )
    and exists (
      select 1 from public.org_members
      where org_members.organization_id = league_organizers.organization_id
        and org_members.user_id = auth.uid()
        and org_members.role = 'org_admin'
        and org_members.status = 'active'
    )
  );
