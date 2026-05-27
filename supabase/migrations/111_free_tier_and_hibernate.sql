-- ── Free tier + Hibernate subscription mode ───────────────────────────────────
--
-- 1. Adds 'free' plan tier (no Stripe, permanently active)
-- 2. Adds 'hibernating' subscription status (org pays $9/mo to keep data alive
--    during their off-season; public site is gated; admin has read-only access)
-- 3. Adds hibernate_until + pre_hibernate_tier columns to subscriptions
-- 4. Seeds free tier plan_configs
-- 5. Updates starter/pro limits to match revised tier strategy
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Extend subscriptions.plan_tier check ───────────────────────────────────
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_tier_check;
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_plan_tier_check
  CHECK (plan_tier IN ('free', 'starter', 'pro', 'club', 'internal'));

-- ── 2. Extend subscriptions.status check to include 'hibernating' ─────────────
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'paused', 'hibernating'));

-- ── 3. Hibernate columns ──────────────────────────────────────────────────────
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS hibernate_until     timestamptz,
  ADD COLUMN IF NOT EXISTS pre_hibernate_tier  text;

-- ── 4. Extend plan_configs.tier check ────────────────────────────────────────
ALTER TABLE public.plan_configs DROP CONSTRAINT IF EXISTS plan_configs_tier_check;
ALTER TABLE public.plan_configs
  ADD CONSTRAINT plan_configs_tier_check
  CHECK (tier IN ('free', 'starter', 'pro', 'club', 'internal'));

-- ── 5. Seed free tier ─────────────────────────────────────────────────────────
-- Free: 1 active league, 50 players, core scheduling + payments, no SMS/advanced features
INSERT INTO public.plan_configs (tier, feature, enabled, limit_value) VALUES
('free', 'max_leagues',           true,  1),
('free', 'max_players',           true,  50),
('free', 'platform_fee_bps',      true,  200),
('free', 'sms_notifications',     false, null),
('free', 'discount_codes',        false, null),
('free', 'double_elimination',    false, null),
('free', 'pools_divisions',       false, null),
('free', 'drop_in_sessions',      false, null),
('free', 'recurring_sessions',    false, null),
('free', 'payment_plans',         false, null),
('free', 'early_bird_pricing',    false, null),
('free', 'custom_domain',         false, null),
('free', 'csv_import',            false, null),
('free', 'print_scoresheets',     false, null),
('free', 'stats_leaderboards',    false, null),
('free', 'co_organizers',         false, null),
('free', 'event_rules_templates', false, null),
('free', 'custom_positions',      false, null),
('free', 'favicon',               false, null),
('free', 'waived_transaction_fee',false, null)
ON CONFLICT (tier, feature) DO NOTHING;

-- ── 6. Update starter: revised limits + unlock more features ──────────────────
-- Player cap: 200 → 150 (tighter to encourage upgrade), league cap stays at 3
UPDATE public.plan_configs SET limit_value = 150 WHERE tier = 'starter' AND feature = 'max_players';

-- Starter now includes: pools, drop-ins, recurring, early bird, CSV, scoresheets,
-- stats, co-organizers, rules templates, custom positions, favicon, discount codes
UPDATE public.plan_configs SET enabled = true WHERE tier = 'starter' AND feature IN (
  'discount_codes',
  'pools_divisions',
  'drop_in_sessions',
  'recurring_sessions',
  'early_bird_pricing',
  'csv_import',
  'print_scoresheets',
  'stats_leaderboards',
  'co_organizers',
  'event_rules_templates',
  'custom_positions',
  'favicon'
);

-- ── 7. Update pro: revised player cap + unlock payment plans ──────────────────
-- Player cap: 1000 → 500 (pro is for established mid-size orgs)
UPDATE public.plan_configs SET limit_value = 500 WHERE tier = 'pro' AND feature = 'max_players';
-- Payment plans now available on Pro (was club-only)
UPDATE public.plan_configs SET enabled = true WHERE tier = 'pro' AND feature = 'payment_plans';
