-- Track which user created each event
alter table public.leagues
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

-- Allow unauthenticated reads of active organizer rows so the public event page
-- can display organizer names/contacts without requiring a login.
drop policy if exists "league_organizers_public_read_active" on public.league_organizers;
create policy "league_organizers_public_read_active" on public.league_organizers
  for select using (status = 'active');
