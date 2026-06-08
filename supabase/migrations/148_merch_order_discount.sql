-- Track the discount applied to each merchandise order row
-- Pro-rated from the basket-level discount at checkout time
ALTER TABLE public.merchandise_orders
  ADD COLUMN IF NOT EXISTS discount_cents integer NOT NULL DEFAULT 0;
