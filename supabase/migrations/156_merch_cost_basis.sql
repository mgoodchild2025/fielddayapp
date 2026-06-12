-- 156_merch_cost_basis.sql
-- Cost basis for merchandise so margin/markup and shop profit can be computed.
-- cost_cents is what the item costs the org (COGS). Nullable = untracked.
-- Variant-level cost is an optional override; when null, the item cost is used.

ALTER TABLE public.merchandise_items
  ADD COLUMN IF NOT EXISTS cost_cents integer;

ALTER TABLE public.merchandise_variants
  ADD COLUMN IF NOT EXISTS cost_cents integer;

COMMENT ON COLUMN public.merchandise_items.cost_cents IS
  'Unit cost (COGS) in cents. NULL = cost not tracked. Used to compute margin and shop profit.';
COMMENT ON COLUMN public.merchandise_variants.cost_cents IS
  'Optional per-variant cost override in cents. NULL = fall back to the item cost.';
