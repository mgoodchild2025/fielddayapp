-- ── Standalone Merchandise Shop ─────────────────────────────────────────────
-- 1. Make league_id nullable so shop orders don't require a league
-- 2. Add shop_enabled flag to merchandise_items
-- 3. Add RLS policy for org members to read shop-enabled items

-- Make league_id nullable
ALTER TABLE public.merchandise_orders ALTER COLUMN league_id DROP NOT NULL;

-- Shop-enable flag per item (default false — existing items don't appear in shop until toggled on)
ALTER TABLE public.merchandise_items ADD COLUMN IF NOT EXISTS shop_enabled boolean NOT NULL DEFAULT false;

-- Org members can read shop-enabled items for their org
DROP POLICY IF EXISTS "org_member_read_shop_merchandise" ON public.merchandise_items;
CREATE POLICY "org_member_read_shop_merchandise" ON public.merchandise_items
  FOR SELECT
  USING (
    shop_enabled = true
    AND EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.organization_id = merchandise_items.organization_id
        AND om.user_id = auth.uid()
    )
  );
