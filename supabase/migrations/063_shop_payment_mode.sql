-- Add shop payment mode and manual payment instructions to org_payment_settings
-- Allows orgs without Stripe to accept shop orders and collect payment offline (e-transfer, cash, etc.)

ALTER TABLE public.org_payment_settings
  ADD COLUMN IF NOT EXISTS shop_payment_mode TEXT NOT NULL DEFAULT 'stripe',
  ADD COLUMN IF NOT EXISTS manual_payment_instructions TEXT;

-- Constraint: only valid modes allowed
ALTER TABLE public.org_payment_settings
  DROP CONSTRAINT IF EXISTS org_payment_settings_shop_payment_mode_check;
ALTER TABLE public.org_payment_settings
  ADD CONSTRAINT org_payment_settings_shop_payment_mode_check
    CHECK (shop_payment_mode IN ('stripe', 'manual'));
