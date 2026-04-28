-- =============================================
-- Migration 009: Phase 2 Features
-- New tables: drop_in_sessions, drop_in_registrations, discount_codes,
--             payment_plans, payment_plan_enrollments, payment_plan_installments
-- New columns on existing tables
-- =============================================

-- ── profiles: SMS opt-in ─────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists sms_opted_in boolean not null default false;

-- ── games: reminder tracking ─────────────────────────────────────────────────

alter table public.games
  add column if not exists reminder_sent timestamptz,
  add column if not exists sms_reminder_sent timestamptz;

-- ── announcements: scheduled send + email delivery ───────────────────────────

alter table public.announcements
  add column if not exists scheduled_for timestamptz,
  add column if not exists email_sent boolean not null default false;

-- ── Drop-in sessions ─────────────────────────────────────────────────────────

create table if not exists public.drop_in_sessions (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  name            text        not null,
  description     text,
  sport           text        not null default 'multi',
  scheduled_at    timestamptz not null,
  location        text,
  capacity        integer     not null default 20,
  price_cents     integer     not null default 0,
  status          text        not null default 'open'
                    check (status in ('open', 'full', 'cancelled', 'completed')),
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index if not exists drop_in_sessions_org_idx
  on public.drop_in_sessions(organization_id, scheduled_at desc);

alter table public.drop_in_sessions enable row level security;

drop policy if exists "drop_in_sessions_read"    on public.drop_in_sessions;
drop policy if exists "drop_in_sessions_service" on public.drop_in_sessions;

create policy "drop_in_sessions_read"
  on public.drop_in_sessions for select
  using (true);

create policy "drop_in_sessions_service"
  on public.drop_in_sessions for all
  using (auth.role() = 'service_role');

-- ── Drop-in registrations ─────────────────────────────────────────────────────

create table if not exists public.drop_in_registrations (
  id              uuid        primary key default gen_random_uuid(),
  session_id      uuid        not null references public.drop_in_sessions(id) on delete cascade,
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  user_id         uuid        not null references public.profiles(id) on delete cascade,
  status          text        not null default 'registered'
                    check (status in ('registered', 'waitlisted', 'cancelled', 'attended')),
  qr_token        text        unique,
  checked_in_at   timestamptz,
  payment_id      uuid,
  created_at      timestamptz default now(),
  unique(session_id, user_id)
);

create index if not exists drop_in_registrations_session_idx
  on public.drop_in_registrations(session_id, status);
create index if not exists drop_in_registrations_user_idx
  on public.drop_in_registrations(user_id);
create index if not exists drop_in_registrations_qr_idx
  on public.drop_in_registrations(qr_token);

alter table public.drop_in_registrations enable row level security;

drop policy if exists "drop_in_reg_self_read"   on public.drop_in_registrations;
drop policy if exists "drop_in_reg_service"     on public.drop_in_registrations;

create policy "drop_in_reg_self_read"
  on public.drop_in_registrations for select
  using (user_id = auth.uid());

create policy "drop_in_reg_service"
  on public.drop_in_registrations for all
  using (auth.role() = 'service_role');

-- ── Discount codes ────────────────────────────────────────────────────────────

create table if not exists public.discount_codes (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  code            text        not null,
  type            text        not null check (type in ('percent', 'fixed')),
  value           numeric     not null,
  applies_to      text        not null default 'all' check (applies_to in ('all', 'leagues', 'dropins')),
  max_uses        integer,
  use_count       integer     not null default 0,
  expires_at      timestamptz,
  active          boolean     not null default true,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  unique(organization_id, code)
);

create index if not exists discount_codes_org_idx
  on public.discount_codes(organization_id, active);

alter table public.discount_codes enable row level security;

drop policy if exists "discount_codes_service" on public.discount_codes;

create policy "discount_codes_service"
  on public.discount_codes for all
  using (auth.role() = 'service_role');

-- Function to increment use_count atomically
create or replace function increment_discount_use(discount_id uuid)
returns void language sql as $$
  update public.discount_codes set use_count = use_count + 1 where id = discount_id;
$$;

-- ── Payment plans ─────────────────────────────────────────────────────────────

create table if not exists public.payment_plans (
  id               uuid        primary key default gen_random_uuid(),
  organization_id  uuid        not null references public.organizations(id) on delete cascade,
  league_id        uuid        not null references public.leagues(id) on delete cascade unique,
  name             text        not null,
  installments     integer     not null check (installments >= 2),
  interval_days    integer     not null check (interval_days >= 7),
  upfront_percent  integer     not null default 0 check (upfront_percent between 0 and 100),
  enabled          boolean     not null default true,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

alter table public.payment_plans enable row level security;

drop policy if exists "payment_plans_org_read" on public.payment_plans;
drop policy if exists "payment_plans_service"  on public.payment_plans;

create policy "payment_plans_org_read"
  on public.payment_plans for select
  using (
    exists (
      select 1 from public.org_members
      where organization_id = payment_plans.organization_id
        and user_id = auth.uid()
        and status = 'active'
    )
  );

create policy "payment_plans_service"
  on public.payment_plans for all
  using (auth.role() = 'service_role');

-- ── Payment plan enrollments ──────────────────────────────────────────────────

create table if not exists public.payment_plan_enrollments (
  id               uuid        primary key default gen_random_uuid(),
  organization_id  uuid        not null references public.organizations(id) on delete cascade,
  registration_id  uuid        not null references public.registrations(id) on delete cascade,
  league_id        uuid        not null references public.leagues(id) on delete cascade,
  plan_id          uuid        not null references public.payment_plans(id),
  total_cents      integer     not null,
  status           text        not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  created_at       timestamptz default now()
);

alter table public.payment_plan_enrollments enable row level security;

drop policy if exists "enrollment_service" on public.payment_plan_enrollments;

create policy "enrollment_service"
  on public.payment_plan_enrollments for all
  using (auth.role() = 'service_role');

-- ── Payment plan installments ─────────────────────────────────────────────────

create table if not exists public.payment_plan_installments (
  id                  uuid        primary key default gen_random_uuid(),
  organization_id     uuid        not null references public.organizations(id) on delete cascade,
  enrollment_id       uuid        not null references public.payment_plan_enrollments(id) on delete cascade,
  installment_number  integer     not null,
  amount_cents        integer     not null,
  due_date            timestamptz not null,
  status              text        not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  payment_id          uuid,
  reminder_sent       timestamptz,
  created_at          timestamptz default now()
);

create index if not exists installments_enrollment_idx
  on public.payment_plan_installments(enrollment_id, installment_number);
create index if not exists installments_due_idx
  on public.payment_plan_installments(due_date, status)
  where status = 'pending';

alter table public.payment_plan_installments enable row level security;

drop policy if exists "installments_service" on public.payment_plan_installments;

create policy "installments_service"
  on public.payment_plan_installments for all
  using (auth.role() = 'service_role');
