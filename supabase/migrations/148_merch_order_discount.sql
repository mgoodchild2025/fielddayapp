-- Track the discount applied to each merchandise order row
-- discount_cents: pro-rated share of basket discount, stored at checkout
-- discount_code_id: FK to the discount code used (nullable)
ALTER TABLE public.merchandise_orders
  ADD COLUMN IF NOT EXISTS discount_cents   integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_code_id uuid    REFERENCES public.discount_codes(id) ON DELETE SET NULL;
