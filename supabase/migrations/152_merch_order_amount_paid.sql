-- ── Merchandise order custom payment amount ──────────────────────────────────
--
-- Allows org admins to record the actual amount collected when marking a merch
-- order as paid manually, which may differ from the listed price (e.g. they
-- accepted a partial payment, waived shipping, or charged an extra fee).
--
-- When NULL: effective price is unit_price_cents × quantity − discount_cents
-- When set: this is the amount actually collected; display shows a diff badge
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.merchandise_orders
  ADD COLUMN IF NOT EXISTS amount_paid_cents integer;

COMMENT ON COLUMN public.merchandise_orders.amount_paid_cents IS
  'Actual amount collected by the admin when marking the order paid manually. '
  'NULL means the standard price (unit_price_cents × quantity − discount_cents) was charged. '
  'Set when the admin overrides the amount at mark-as-paid time.';
