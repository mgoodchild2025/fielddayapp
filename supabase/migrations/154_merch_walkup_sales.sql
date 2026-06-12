-- 154_merch_walkup_sales.sql
-- Allow org admins to record in-person / off-system merchandise sales to
-- non-registered buyers (spectators, walk-ups). Such an order has no user_id;
-- we capture optional free-text buyer name/email instead, and stamp who
-- recorded it. sale_source distinguishes online shop orders from in-person.

-- Orders no longer require a registered buyer.
ALTER TABLE public.merchandise_orders ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.merchandise_orders
  ADD COLUMN IF NOT EXISTS buyer_name       text,
  ADD COLUMN IF NOT EXISTS buyer_email      text,
  ADD COLUMN IF NOT EXISTS created_by_admin uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sale_source      text NOT NULL DEFAULT 'online'
    CHECK (sale_source IN ('online', 'in_person'));

COMMENT ON COLUMN public.merchandise_orders.buyer_name IS
  'Free-text buyer name for in-person sales to non-registered users (nullable).';
COMMENT ON COLUMN public.merchandise_orders.sale_source IS
  'online = shop/registration purchase; in_person = admin-recorded counter sale.';
