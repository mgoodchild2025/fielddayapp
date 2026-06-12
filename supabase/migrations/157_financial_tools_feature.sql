-- 157_financial_tools_feature.sql
-- Gate the Finances section (profit tracking, shop P&L, cost planning) to Pro+.
-- Starter/free fall through to disabled (no row needed for free; canAccess
-- defaults missing configs to false).

INSERT INTO public.plan_configs (tier, feature, enabled, limit_value) VALUES
('starter',  'financial_tools', false, null),
('pro',      'financial_tools', true,  null),
('club',     'financial_tools', true,  null),
('internal', 'financial_tools', true,  null)
ON CONFLICT (tier, feature) DO UPDATE
  SET enabled     = EXCLUDED.enabled,
      limit_value = EXCLUDED.limit_value,
      updated_at  = now();
