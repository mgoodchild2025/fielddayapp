create table if not exists public.pickup_invites (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  league_id       uuid not null references public.leagues(id) on delete cascade,
  email           text not null,
  token           uuid not null default gen_random_uuid() unique,
  status          text not null default 'pending' check (status in ('pending', 'accepted')),
  invited_at      timestamptz not null default now(),
  unique(league_id, email)
);

alter table public.pickup_invites enable row level security;

drop policy if exists "Org admins manage pickup invites" on public.pickup_invites;
create policy "Org admins manage pickup invites"
  on public.pickup_invites for all
  using (
    organization_id in (
      select organization_id from public.org_members
      where user_id = auth.uid() and role in ('org_admin', 'league_admin')
    )
  );

drop policy if exists "Players read their own invites" on public.pickup_invites;
create policy "Players read their own invites"
  on public.pickup_invites for select
  using (
    email = (select email from auth.users where id = auth.uid())
  );
