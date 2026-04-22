-- =============================================
-- PLATFORM LEVEL
-- =============================================

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text,
  avatar_url text,
  platform_role text default null check (platform_role in ('platform_admin')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  sport text default 'multi',
  city text,
  status text not null default 'active' check (status in ('active', 'suspended', 'trial')),
  stripe_customer_id text unique,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.org_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'player' check (role in ('org_admin', 'league_admin', 'captain', 'player')),
  status text not null default 'active' check (status in ('active', 'invited', 'suspended')),
  invited_email text,
  joined_at timestamptz default now(),
  unique(organization_id, user_id)
);

create table public.org_branding (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid unique not null references public.organizations(id) on delete cascade,
  primary_color text default '#FF5C00',
  secondary_color text default '#0F1F3D',
  bg_color text default '#FAFAF8',
  text_color text default '#1A1A1A',
  heading_font text default 'Barlow Condensed',
  body_font text default 'DM Sans',
  logo_url text,
  favicon_url text,
  hero_image_url text,
  tagline text,
  contact_email text,
  custom_domain text unique,
  social_instagram text,
  social_facebook text,
  social_x text,
  social_tiktok text,
  updated_at timestamptz default now()
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid unique not null references public.organizations(id) on delete cascade,
  stripe_subscription_id text unique,
  stripe_customer_id text,
  plan_tier text not null default 'internal' check (plan_tier in ('starter', 'pro', 'club', 'internal')),
  billing_interval text check (billing_interval in ('month', 'year')),
  status text not null default 'trialing' check (status in ('trialing', 'active', 'past_due', 'canceled', 'paused')),
  trial_end timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean default false,
  canceled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.stripe_connect_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid unique not null references public.organizations(id) on delete cascade,
  stripe_account_id text unique not null,
  status text not null default 'pending' check (status in ('pending', 'active', 'restricted')),
  charges_enabled boolean default false,
  payouts_enabled boolean default false,
  created_at timestamptz default now()
);

-- =============================================
-- ORG LEVEL
-- =============================================

create table public.leagues (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  league_type text not null check (league_type in ('team', 'individual', 'dropin', 'tournament')),
  sport text default 'beach_volleyball',
  status text not null default 'draft' check (status in ('draft', 'registration_open', 'active', 'completed', 'archived')),
  registration_opens_at timestamptz,
  registration_closes_at timestamptz,
  season_start_date date,
  season_end_date date,
  max_teams int,
  min_team_size int default 4,
  max_team_size int default 8,
  price_cents int not null default 0,
  currency text not null default 'cad',
  early_bird_price_cents int,
  early_bird_deadline timestamptz,
  payment_mode text not null default 'per_player' check (payment_mode in ('per_player', 'per_team')),
  waiver_version_id uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(organization_id, slug)
);

create table public.divisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  league_id uuid not null references public.leagues(id) on delete cascade,
  name text not null,
  sort_order int default 0,
  created_at timestamptz default now()
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  league_id uuid not null references public.leagues(id) on delete cascade,
  division_id uuid references public.divisions(id),
  name text not null,
  color text,
  logo_url text,
  status text not null default 'active' check (status in ('active', 'inactive', 'withdrawn')),
  created_at timestamptz default now()
);

create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  role text not null default 'player' check (role in ('captain', 'player', 'sub')),
  status text not null default 'active' check (status in ('active', 'inactive', 'invited')),
  invited_email text,
  joined_at timestamptz default now(),
  unique(team_id, user_id)
);

create table public.waivers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  version int not null default 1,
  title text not null,
  content text not null,
  is_active boolean default true,
  created_at timestamptz default now()
);

create table public.waiver_signatures (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  waiver_id uuid not null references public.waivers(id),
  signed_at timestamptz default now(),
  signature_name text not null,
  ip_address text,
  pdf_url text,
  unique(user_id, waiver_id)
);

create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  league_id uuid not null references public.leagues(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  team_id uuid references public.teams(id),
  waiver_signature_id uuid references public.waiver_signatures(id),
  status text not null default 'pending' check (status in ('pending', 'active', 'withdrawn', 'waitlisted')),
  form_data jsonb,
  created_at timestamptz default now(),
  unique(league_id, user_id)
);

create table public.player_details (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  skill_level text check (skill_level in ('beginner', 'intermediate', 'competitive')),
  t_shirt_size text check (t_shirt_size in ('XS','S','M','L','XL','XXL')),
  emergency_contact_name text,
  emergency_contact_phone text,
  date_of_birth date,
  how_did_you_hear text,
  updated_at timestamptz default now(),
  unique(organization_id, user_id)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  registration_id uuid references public.registrations(id),
  user_id uuid not null references public.profiles(id) on delete cascade,
  league_id uuid references public.leagues(id),
  stripe_payment_intent_id text unique,
  stripe_checkout_session_id text unique,
  amount_cents int not null,
  currency text not null default 'cad',
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'refunded', 'manual')),
  payment_method text default 'stripe' check (payment_method in ('stripe', 'cash', 'etransfer')),
  notes text,
  paid_at timestamptz,
  created_at timestamptz default now()
);

create table public.games (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  league_id uuid not null references public.leagues(id) on delete cascade,
  division_id uuid references public.divisions(id),
  home_team_id uuid references public.teams(id),
  away_team_id uuid references public.teams(id),
  court text,
  scheduled_at timestamptz not null,
  week_number int,
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled', 'postponed')),
  created_at timestamptz default now()
);

create table public.game_results (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  game_id uuid unique not null references public.games(id) on delete cascade,
  home_score int,
  away_score int,
  sets jsonb,
  submitted_by uuid references public.profiles(id),
  confirmed_by uuid references public.profiles(id),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'disputed')),
  submitted_at timestamptz default now(),
  confirmed_at timestamptz
);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  league_id uuid references public.leagues(id),
  title text not null,
  body text not null,
  sent_by uuid references public.profiles(id),
  sent_at timestamptz,
  created_at timestamptz default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  read boolean default false,
  data jsonb,
  created_at timestamptz default now()
);

-- =============================================
-- AUTO-CREATE PROFILE ON SIGN UP
-- =============================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =============================================
-- RLS
-- =============================================

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.org_members enable row level security;
alter table public.org_branding enable row level security;
alter table public.subscriptions enable row level security;
alter table public.stripe_connect_accounts enable row level security;
alter table public.leagues enable row level security;
alter table public.divisions enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.waivers enable row level security;
alter table public.waiver_signatures enable row level security;
alter table public.registrations enable row level security;
alter table public.player_details enable row level security;
alter table public.payments enable row level security;
alter table public.games enable row level security;
alter table public.game_results enable row level security;
alter table public.announcements enable row level security;
alter table public.notifications enable row level security;

-- Helper function to get current org from session variable
create or replace function current_org_id() returns uuid as $$
  select nullif(current_setting('app.current_org_id', true), '')::uuid;
$$ language sql stable;

-- profiles: users can read and update their own
create policy "profiles_self_read" on public.profiles
  for select using (id = auth.uid());
create policy "profiles_self_update" on public.profiles
  for update using (id = auth.uid());
create policy "profiles_service_all" on public.profiles
  for all using (auth.role() = 'service_role');

-- organizations: readable by org members
create policy "orgs_read_by_member" on public.organizations
  for select using (
    id = current_org_id()
    or exists (
      select 1 from public.org_members
      where org_members.organization_id = organizations.id
        and org_members.user_id = auth.uid()
    )
  );
create policy "orgs_service_all" on public.organizations
  for all using (auth.role() = 'service_role');

-- org_members
create policy "org_members_read_own_org" on public.org_members
  for select using (organization_id = current_org_id());
create policy "org_members_admin_all" on public.org_members
  for all using (
    organization_id = current_org_id()
    and exists (
      select 1 from public.org_members om2
      where om2.organization_id = current_org_id()
        and om2.user_id = auth.uid()
        and om2.role in ('org_admin', 'league_admin')
    )
  );
create policy "org_members_service_all" on public.org_members
  for all using (auth.role() = 'service_role');

-- org_branding: public read (needed for middleware domain resolution)
create policy "org_branding_public_read" on public.org_branding
  for select using (true);
create policy "org_branding_admin_update" on public.org_branding
  for update using (
    organization_id = current_org_id()
    and exists (
      select 1 from public.org_members
      where org_members.organization_id = current_org_id()
        and org_members.user_id = auth.uid()
        and org_members.role = 'org_admin'
    )
  );
create policy "org_branding_service_all" on public.org_branding
  for all using (auth.role() = 'service_role');

-- subscriptions: org members can read their own
create policy "subscriptions_read" on public.subscriptions
  for select using (organization_id = current_org_id());
create policy "subscriptions_service_all" on public.subscriptions
  for all using (auth.role() = 'service_role');

-- leagues
create policy "leagues_public_read" on public.leagues
  for select using (
    organization_id = current_org_id()
    and status != 'draft'
  );
create policy "leagues_draft_admin_read" on public.leagues
  for select using (
    organization_id = current_org_id()
    and status = 'draft'
    and exists (
      select 1 from public.org_members
      where org_members.organization_id = current_org_id()
        and org_members.user_id = auth.uid()
        and org_members.role in ('org_admin', 'league_admin')
    )
  );
create policy "leagues_admin_write" on public.leagues
  for all using (
    organization_id = current_org_id()
    and exists (
      select 1 from public.org_members
      where org_members.organization_id = current_org_id()
        and org_members.user_id = auth.uid()
        and org_members.role in ('org_admin', 'league_admin')
    )
  );
create policy "leagues_service_all" on public.leagues
  for all using (auth.role() = 'service_role');

-- divisions
create policy "divisions_read" on public.divisions
  for select using (organization_id = current_org_id());
create policy "divisions_admin_write" on public.divisions
  for all using (
    organization_id = current_org_id()
    and exists (
      select 1 from public.org_members
      where org_members.organization_id = current_org_id()
        and org_members.user_id = auth.uid()
        and org_members.role in ('org_admin', 'league_admin')
    )
  );
create policy "divisions_service_all" on public.divisions
  for all using (auth.role() = 'service_role');

-- teams
create policy "teams_read" on public.teams
  for select using (organization_id = current_org_id());
create policy "teams_member_insert" on public.teams
  for insert with check (
    organization_id = current_org_id()
    and auth.uid() is not null
  );
create policy "teams_admin_all" on public.teams
  for all using (
    organization_id = current_org_id()
    and exists (
      select 1 from public.org_members
      where org_members.organization_id = current_org_id()
        and org_members.user_id = auth.uid()
        and org_members.role in ('org_admin', 'league_admin')
    )
  );
create policy "teams_service_all" on public.teams
  for all using (auth.role() = 'service_role');

-- team_members
create policy "team_members_read" on public.team_members
  for select using (organization_id = current_org_id());
create policy "team_members_captain_insert" on public.team_members
  for insert with check (organization_id = current_org_id() and auth.uid() is not null);
create policy "team_members_admin_all" on public.team_members
  for all using (
    organization_id = current_org_id()
    and exists (
      select 1 from public.org_members
      where org_members.organization_id = current_org_id()
        and org_members.user_id = auth.uid()
        and org_members.role in ('org_admin', 'league_admin')
    )
  );
create policy "team_members_service_all" on public.team_members
  for all using (auth.role() = 'service_role');

-- waivers: public read within org
create policy "waivers_read" on public.waivers
  for select using (organization_id = current_org_id());
create policy "waivers_admin_write" on public.waivers
  for all using (
    organization_id = current_org_id()
    and exists (
      select 1 from public.org_members
      where org_members.organization_id = current_org_id()
        and org_members.user_id = auth.uid()
        and org_members.role in ('org_admin', 'league_admin')
    )
  );
create policy "waivers_service_all" on public.waivers
  for all using (auth.role() = 'service_role');

-- waiver_signatures
create policy "waiver_signatures_own" on public.waiver_signatures
  for select using (organization_id = current_org_id() and user_id = auth.uid());
create policy "waiver_signatures_insert" on public.waiver_signatures
  for insert with check (organization_id = current_org_id() and user_id = auth.uid());
create policy "waiver_signatures_admin_read" on public.waiver_signatures
  for select using (
    organization_id = current_org_id()
    and exists (
      select 1 from public.org_members
      where org_members.organization_id = current_org_id()
        and org_members.user_id = auth.uid()
        and org_members.role in ('org_admin', 'league_admin')
    )
  );
create policy "waiver_signatures_service_all" on public.waiver_signatures
  for all using (auth.role() = 'service_role');

-- registrations
create policy "registrations_own" on public.registrations
  for select using (organization_id = current_org_id() and user_id = auth.uid());
create policy "registrations_insert" on public.registrations
  for insert with check (organization_id = current_org_id() and user_id = auth.uid());
create policy "registrations_admin_all" on public.registrations
  for all using (
    organization_id = current_org_id()
    and exists (
      select 1 from public.org_members
      where org_members.organization_id = current_org_id()
        and org_members.user_id = auth.uid()
        and org_members.role in ('org_admin', 'league_admin')
    )
  );
create policy "registrations_service_all" on public.registrations
  for all using (auth.role() = 'service_role');

-- player_details
create policy "player_details_own" on public.player_details
  for all using (organization_id = current_org_id() and user_id = auth.uid());
create policy "player_details_admin_read" on public.player_details
  for select using (
    organization_id = current_org_id()
    and exists (
      select 1 from public.org_members
      where org_members.organization_id = current_org_id()
        and org_members.user_id = auth.uid()
        and org_members.role in ('org_admin', 'league_admin')
    )
  );
create policy "player_details_service_all" on public.player_details
  for all using (auth.role() = 'service_role');

-- payments
create policy "payments_own" on public.payments
  for select using (organization_id = current_org_id() and user_id = auth.uid());
create policy "payments_admin_all" on public.payments
  for all using (
    organization_id = current_org_id()
    and exists (
      select 1 from public.org_members
      where org_members.organization_id = current_org_id()
        and org_members.user_id = auth.uid()
        and org_members.role in ('org_admin', 'league_admin')
    )
  );
create policy "payments_service_all" on public.payments
  for all using (auth.role() = 'service_role');

-- games
create policy "games_read" on public.games
  for select using (organization_id = current_org_id());
create policy "games_admin_write" on public.games
  for all using (
    organization_id = current_org_id()
    and exists (
      select 1 from public.org_members
      where org_members.organization_id = current_org_id()
        and org_members.user_id = auth.uid()
        and org_members.role in ('org_admin', 'league_admin')
    )
  );
create policy "games_service_all" on public.games
  for all using (auth.role() = 'service_role');

-- game_results: captains of involved teams can insert; both captains can confirm; admins do anything
create policy "game_results_read" on public.game_results
  for select using (organization_id = current_org_id());
create policy "game_results_captain_insert" on public.game_results
  for insert with check (
    organization_id = current_org_id()
    and exists (
      select 1 from public.team_members tm
      join public.games g on g.id = game_results.game_id
      where (tm.team_id = g.home_team_id or tm.team_id = g.away_team_id)
        and tm.user_id = auth.uid()
        and tm.role = 'captain'
    )
  );
create policy "game_results_captain_confirm" on public.game_results
  for update using (
    organization_id = current_org_id()
    and exists (
      select 1 from public.team_members tm
      join public.games g on g.id = game_results.game_id
      where (tm.team_id = g.home_team_id or tm.team_id = g.away_team_id)
        and tm.user_id = auth.uid()
        and tm.role = 'captain'
    )
  );
create policy "game_results_admin_all" on public.game_results
  for all using (
    organization_id = current_org_id()
    and exists (
      select 1 from public.org_members
      where org_members.organization_id = current_org_id()
        and org_members.user_id = auth.uid()
        and org_members.role in ('org_admin', 'league_admin')
    )
  );
create policy "game_results_service_all" on public.game_results
  for all using (auth.role() = 'service_role');

-- announcements
create policy "announcements_read" on public.announcements
  for select using (organization_id = current_org_id());
create policy "announcements_admin_write" on public.announcements
  for all using (
    organization_id = current_org_id()
    and exists (
      select 1 from public.org_members
      where org_members.organization_id = current_org_id()
        and org_members.user_id = auth.uid()
        and org_members.role in ('org_admin', 'league_admin')
    )
  );
create policy "announcements_service_all" on public.announcements
  for all using (auth.role() = 'service_role');

-- notifications: users see only their own
create policy "notifications_own" on public.notifications
  for all using (organization_id = current_org_id() and user_id = auth.uid());
create policy "notifications_service_all" on public.notifications
  for all using (auth.role() = 'service_role');
