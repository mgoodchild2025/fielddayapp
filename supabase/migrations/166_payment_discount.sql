-- 166_payment_discount.sql
-- Record which discount code was applied to a registration payment (and how much
-- it took off) so org admins can see discount details on the Payments screen.
-- Mirrors the merchandise_orders pattern (migration 148).

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS discount_code_id uuid REFERENCES public.discount_codes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS discount_cents   integer NOT NULL DEFAULT 0;
