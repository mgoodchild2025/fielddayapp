-- Track payment independently from fulfillment.
-- paid_at is set when an admin records manual payment (or by webhook for Stripe).
-- This allows an order to be fulfilled before payment is confirmed, while still
-- tracking whether the payment has been collected.
ALTER TABLE public.merchandise_orders
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;
