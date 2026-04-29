-- Sessions for pickup / drop-in events
-- Each row = one scheduled play session within an event.

create table public.event_sessions (
  id               uuid primary key default gen_random_uuid(),
  league_id        uuid not null references public.leagues(id) on delete cascade,
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  scheduled_at     timestamptz not null,
  duration_minutes int not null default 90,
  capacity         int,          -- null = unlimited
  location_override text,        -- overrides the event venue for this session
  notes            text,
  status           text not null default 'open'
                     check (status in ('open', 'cancelled')),
  created_at       timestamptz not null default now()
);

create index on public.event_sessions (league_id, scheduled_at);

create table public.session_registrations (
  id               uuid primary key default gen_random_uuid(),
  session_id       uuid not null references public.event_sessions(id) on delete cascade,
  league_id        uuid not null references public.leagues(id) on delete cascade,
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  status           text not null default 'registered'
                     check (status in ('registered', 'cancelled')),
  created_at       timestamptz not null default now(),
  unique (session_id, user_id)
);

create index on public.session_registrations (league_id, user_id);
create index on public.session_registrations (session_id);

-- RLS ------------------------------------------------------------------
alter table public.event_sessions enable row level security;
alter table public.session_registrations enable row level security;

-- event_sessions: anyone can read open sessions for their org's events
drop policy if exists "event_sessions_select" on public.event_sessions;
create policy "event_sessions_select" on public.event_sessions
  for select using (true);

-- event_sessions: org admins can manage
drop policy if exists "event_sessions_admin" on public.event_sessions;
create policy "event_sessions_admin" on public.event_sessions
  for all using (
    exists (
      select 1 from public.org_members om
      where om.organization_id = event_sessions.organization_id
        and om.user_id = auth.uid()
        and om.role in ('org_admin', 'league_admin')
    )
  );

-- session_registrations: users can read all (to see who's in a session)
drop policy if exists "session_reg_select" on public.session_registrations;
create policy "session_reg_select" on public.session_registrations
  for select using (true);

-- session_registrations: users can insert their own row
drop policy if exists "session_reg_insert" on public.session_registrations;
create policy "session_reg_insert" on public.session_registrations
  for insert with check (user_id = auth.uid());

-- session_registrations: users can update their own row (cancel)
drop policy if exists "session_reg_update_own" on public.session_registrations;
create policy "session_reg_update_own" on public.session_registrations
  for update using (user_id = auth.uid());

-- session_registrations: org admins can manage all
drop policy if exists "session_reg_admin" on public.session_registrations;
create policy "session_reg_admin" on public.session_registrations
  for all using (
    exists (
      select 1 from public.org_members om
      where om.organization_id = session_registrations.organization_id
        and om.user_id = auth.uid()
        and om.role in ('org_admin', 'league_admin')
    )
  );
