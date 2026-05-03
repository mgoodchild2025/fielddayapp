-- ── Plan configuration tables ────────────────────────────────────────────────
--
-- plan_configs: one row per (tier, feature) defining defaults for each plan.
-- org_feature_overrides: per-org exceptions on top of the tier defaults.
--
-- Boolean features use the `enabled` column.
-- Numeric limits (max_leagues, max_players, platform_fee_bps) use `limit_value`.
-- limit_value = NULL means unlimited / not applicable.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.plan_configs (
  id            uuid primary key default gen_random_uuid(),
  tier          text not null check (tier in ('starter', 'pro', 'club', 'internal')),
  feature       text not null,
  enabled       boolean not null default false,
  limit_value   integer,   -- null = unlimited / N/A
  updated_at    timestamptz default now(),
  unique (tier, feature)
);

create table if not exists public.org_feature_overrides (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  feature         text not null,
  enabled         boolean not null,
  limit_value     integer,
  note            text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  unique (organization_id, feature)
);

-- Platform admin only — no public access
alter table public.plan_configs           enable row level security;
alter table public.org_feature_overrides  enable row level security;

-- Service role can do everything (used by platform admin actions)
create policy "plan_configs_service"          on public.plan_configs          for all using (true) with check (true);
create policy "org_feature_overrides_service" on public.org_feature_overrides for all using (true) with check (true);

-- ── Seed defaults ─────────────────────────────────────────────────────────────
-- Numeric limits (enabled=true means the limit is active; limit_value=null=unlimited)

insert into public.plan_configs (tier, feature, enabled, limit_value) values
-- ── Starter ──────────────────────────────────────────────────────────────────
('starter', 'max_leagues',           true,  3),
('starter', 'max_players',           true,  200),
('starter', 'platform_fee_bps',      true,  200),
('starter', 'sms_notifications',     false, null),
('starter', 'discount_codes',        false, null),
('starter', 'double_elimination',    false, null),
('starter', 'pools_divisions',       false, null),
('starter', 'drop_in_sessions',      false, null),
('starter', 'recurring_sessions',    false, null),
('starter', 'payment_plans',         false, null),
('starter', 'early_bird_pricing',    false, null),
('starter', 'custom_domain',         false, null),
('starter', 'csv_import',            false, null),
('starter', 'print_scoresheets',     false, null),
('starter', 'stats_leaderboards',    false, null),
('starter', 'co_organizers',         false, null),
('starter', 'event_rules_templates', false, null),
('starter', 'custom_positions',      false, null),
('starter', 'favicon',               false, null),
('starter', 'waived_transaction_fee',false, null),

-- ── Pro ───────────────────────────────────────────────────────────────────────
('pro', 'max_leagues',           true,  10),
('pro', 'max_players',           true,  1000),
('pro', 'platform_fee_bps',      true,  100),
('pro', 'sms_notifications',     true,  null),
('pro', 'discount_codes',        true,  null),
('pro', 'double_elimination',    true,  null),
('pro', 'pools_divisions',       true,  null),
('pro', 'drop_in_sessions',      true,  null),
('pro', 'recurring_sessions',    true,  null),
('pro', 'payment_plans',         false, null),
('pro', 'early_bird_pricing',    true,  null),
('pro', 'custom_domain',         false, null),
('pro', 'csv_import',            true,  null),
('pro', 'print_scoresheets',     true,  null),
('pro', 'stats_leaderboards',    true,  null),
('pro', 'co_organizers',         true,  null),
('pro', 'event_rules_templates', true,  null),
('pro', 'custom_positions',      true,  null),
('pro', 'favicon',               true,  null),
('pro', 'waived_transaction_fee',false, null),

-- ── Club ──────────────────────────────────────────────────────────────────────
('club', 'max_leagues',           false, null),
('club', 'max_players',           false, null),
('club', 'platform_fee_bps',      true,  0),
('club', 'sms_notifications',     true,  null),
('club', 'discount_codes',        true,  null),
('club', 'double_elimination',    true,  null),
('club', 'pools_divisions',       true,  null),
('club', 'drop_in_sessions',      true,  null),
('club', 'recurring_sessions',    true,  null),
('club', 'payment_plans',         true,  null),
('club', 'early_bird_pricing',    true,  null),
('club', 'custom_domain',         true,  null),
('club', 'csv_import',            true,  null),
('club', 'print_scoresheets',     true,  null),
('club', 'stats_leaderboards',    true,  null),
('club', 'co_organizers',         true,  null),
('club', 'event_rules_templates', true,  null),
('club', 'custom_positions',      true,  null),
('club', 'favicon',               true,  null),
('club', 'waived_transaction_fee',true,  null),

-- ── Internal (Fieldday staff / test orgs) ────────────────────────────────────
('internal', 'max_leagues',           false, null),
('internal', 'max_players',           false, null),
('internal', 'platform_fee_bps',      true,  0),
('internal', 'sms_notifications',     true,  null),
('internal', 'discount_codes',        true,  null),
('internal', 'double_elimination',    true,  null),
('internal', 'pools_divisions',       true,  null),
('internal', 'drop_in_sessions',      true,  null),
('internal', 'recurring_sessions',    true,  null),
('internal', 'payment_plans',         true,  null),
('internal', 'early_bird_pricing',    true,  null),
('internal', 'custom_domain',         true,  null),
('internal', 'csv_import',            true,  null),
('internal', 'print_scoresheets',     true,  null),
('internal', 'stats_leaderboards',    true,  null),
('internal', 'co_organizers',         true,  null),
('internal', 'event_rules_templates', true,  null),
('internal', 'custom_positions',      true,  null),
('internal', 'favicon',               true,  null),
('internal', 'waived_transaction_fee',true,  null)

on conflict (tier, feature) do nothing;
