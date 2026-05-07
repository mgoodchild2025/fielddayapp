-- When a merchandise variant is deleted (e.g. when an admin re-saves item variants),
-- set variant_id to NULL on existing orders rather than blocking the delete.
-- This preserves order history while allowing variant list edits.

ALTER TABLE public.merchandise_orders
  DROP CONSTRAINT IF EXISTS merchandise_orders_variant_id_fkey;

ALTER TABLE public.merchandise_orders
  ADD CONSTRAINT merchandise_orders_variant_id_fkey
  FOREIGN KEY (variant_id)
  REFERENCES public.merchandise_variants(id)
  ON DELETE SET NULL;
