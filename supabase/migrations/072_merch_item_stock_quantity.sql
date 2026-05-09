-- Add stock_quantity to merchandise_items for items that have no variants.
-- When variants exist, stock is tracked per-variant (merchandise_variants.stock_quantity).
-- When no variants exist, this column is used instead.
ALTER TABLE public.merchandise_items
  ADD COLUMN IF NOT EXISTS stock_quantity integer;
