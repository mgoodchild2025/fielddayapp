-- Persistent shopping cart scoped per user + org.
-- Syncs across all devices for the same user.

CREATE TABLE IF NOT EXISTS public.cart_items (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL REFERENCES auth.users(id)              ON DELETE CASCADE,
  organization_id  uuid        NOT NULL REFERENCES public.organizations(id)    ON DELETE CASCADE,
  item_id          uuid        NOT NULL REFERENCES public.merchandise_items(id) ON DELETE CASCADE,
  variant_id       uuid                 REFERENCES public.merchandise_variants(id) ON DELETE SET NULL,
  quantity         integer     NOT NULL DEFAULT 1,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cart_items_quantity_check CHECK (quantity >= 1)
);

CREATE INDEX IF NOT EXISTS cart_items_user_org_idx
  ON public.cart_items(user_id, organization_id);

ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_manage_own_cart" ON public.cart_items;
CREATE POLICY "users_manage_own_cart" ON public.cart_items
  FOR ALL
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
