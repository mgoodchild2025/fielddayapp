-- Drop-in pricing and registration type support

-- Season price stays on leagues.price_cents; add optional drop-in price
alter table public.leagues
  add column if not exists drop_in_price_cents integer;

-- Distinguish season vs drop-in invites
alter table public.pickup_invites
  add column if not exists invite_type text not null default 'season'
    check (invite_type in ('season', 'drop_in'));

-- Drop the old blanket unique constraint (season_invites: one per email; drop-in: many allowed)
alter table public.pickup_invites
  drop constraint if exists pickup_invites_league_id_email_key;

-- Season invites: still unique per email per league
create unique index if not exists pickup_invites_season_unique
  on public.pickup_invites (league_id, email)
  where invite_type = 'season';

-- Registrations: track whether the player is a season or drop-in registrant
alter table public.registrations
  add column if not exists registration_type text not null default 'season'
    check (registration_type in ('season', 'drop_in'));

-- Drop-in registrations expire (null = permanent / season)
alter table public.registrations
  add column if not exists expires_at timestamptz;
