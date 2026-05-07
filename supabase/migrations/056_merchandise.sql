-- 056_merchandise.sql
-- Merchandise sales feature: item library, variants, league assignments, orders

-- ── merchandise_items ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.merchandise_items (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            text        NOT NULL,
  description     text,
  price_cents     integer     NOT NULL,
  currency        text        NOT NULL DEFAULT 'cad',
  image_url       text,
  is_active       boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.merchandise_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_merchandise_items" ON public.merchandise_items;
CREATE POLICY "service_role_all_merchandise_items" ON public.merchandise_items
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "org_admin_merchandise_items" ON public.merchandise_items;
CREATE POLICY "org_admin_merchandise_items" ON public.merchandise_items
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.organization_id = merchandise_items.organization_id
        AND om.user_id = auth.uid()
        AND om.role IN ('org_admin', 'league_admin')
        AND om.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.organization_id = merchandise_items.organization_id
        AND om.user_id = auth.uid()
        AND om.role IN ('org_admin', 'league_admin')
        AND om.status = 'active'
    )
  );

DROP POLICY IF EXISTS "player_read_merchandise_items" ON public.merchandise_items;
CREATE POLICY "player_read_merchandise_items" ON public.merchandise_items
  FOR SELECT TO authenticated
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1 FROM public.league_merchandise lm
        JOIN public.registrations r ON r.league_id = lm.league_id
      WHERE lm.item_id = merchandise_items.id
        AND r.user_id = auth.uid()
        AND r.organization_id = merchandise_items.organization_id
    )
  );


-- ── merchandise_variants ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.merchandise_variants (
  id             uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id        uuid    NOT NULL REFERENCES public.merchandise_items(id) ON DELETE CASCADE,
  label          text    NOT NULL,
  stock_quantity integer,          -- null = unlimited
  sort_order     integer NOT NULL DEFAULT 0
);

ALTER TABLE public.merchandise_variants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_merchandise_variants" ON public.merchandise_variants;
CREATE POLICY "service_role_all_merchandise_variants" ON public.merchandise_variants
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "org_admin_merchandise_variants" ON public.merchandise_variants;
CREATE POLICY "org_admin_merchandise_variants" ON public.merchandise_variants
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.merchandise_items mi
        JOIN public.org_members om ON om.organization_id = mi.organization_id
      WHERE mi.id = merchandise_variants.item_id
        AND om.user_id = auth.uid()
        AND om.role IN ('org_admin', 'league_admin')
        AND om.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.merchandise_items mi
        JOIN public.org_members om ON om.organization_id = mi.organization_id
      WHERE mi.id = merchandise_variants.item_id
        AND om.user_id = auth.uid()
        AND om.role IN ('org_admin', 'league_admin')
        AND om.status = 'active'
    )
  );

DROP POLICY IF EXISTS "player_read_merchandise_variants" ON public.merchandise_variants;
CREATE POLICY "player_read_merchandise_variants" ON public.merchandise_variants
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.merchandise_items mi
        JOIN public.league_merchandise lm ON lm.item_id = mi.id
        JOIN public.registrations r ON r.league_id = lm.league_id
      WHERE mi.id = merchandise_variants.item_id
        AND r.user_id = auth.uid()
        AND mi.is_active = true
    )
  );


-- ── league_merchandise ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.league_merchandise (
  league_id uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  item_id   uuid NOT NULL REFERENCES public.merchandise_items(id) ON DELETE CASCADE,
  PRIMARY KEY (league_id, item_id)
);

ALTER TABLE public.league_merchandise ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_league_merchandise" ON public.league_merchandise;
CREATE POLICY "service_role_all_league_merchandise" ON public.league_merchandise
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "org_admin_league_merchandise" ON public.league_merchandise;
CREATE POLICY "org_admin_league_merchandise" ON public.league_merchandise
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.leagues l
        JOIN public.org_members om ON om.organization_id = l.organization_id
      WHERE l.id = league_merchandise.league_id
        AND om.user_id = auth.uid()
        AND om.role IN ('org_admin', 'league_admin')
        AND om.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.leagues l
        JOIN public.org_members om ON om.organization_id = l.organization_id
      WHERE l.id = league_merchandise.league_id
        AND om.user_id = auth.uid()
        AND om.role IN ('org_admin', 'league_admin')
        AND om.status = 'active'
    )
  );

DROP POLICY IF EXISTS "player_read_league_merchandise" ON public.league_merchandise;
CREATE POLICY "player_read_league_merchandise" ON public.league_merchandise
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.registrations r
      WHERE r.league_id = league_merchandise.league_id
        AND r.user_id = auth.uid()
    )
  );


-- ── merchandise_orders ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.merchandise_orders (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  league_id       uuid        NOT NULL REFERENCES public.leagues(id),
  registration_id uuid        REFERENCES public.registrations(id) ON DELETE SET NULL,
  user_id         uuid        NOT NULL REFERENCES public.profiles(id),
  item_id         uuid        NOT NULL REFERENCES public.merchandise_items(id),
  variant_id      uuid        REFERENCES public.merchandise_variants(id),
  quantity        integer     NOT NULL DEFAULT 1,
  unit_price_cents integer    NOT NULL,
  status          text        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','paid','fulfilled','cancelled')),
  notes           text,
  payment_id      uuid,       -- linked after webhook confirms
  created_at      timestamptz NOT NULL DEFAULT now(),
  fulfilled_at    timestamptz
);

ALTER TABLE public.merchandise_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_merchandise_orders" ON public.merchandise_orders;
CREATE POLICY "service_role_all_merchandise_orders" ON public.merchandise_orders
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "org_admin_merchandise_orders" ON public.merchandise_orders;
CREATE POLICY "org_admin_merchandise_orders" ON public.merchandise_orders
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.organization_id = merchandise_orders.organization_id
        AND om.user_id = auth.uid()
        AND om.role IN ('org_admin', 'league_admin')
        AND om.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.organization_id = merchandise_orders.organization_id
        AND om.user_id = auth.uid()
        AND om.role IN ('org_admin', 'league_admin')
        AND om.status = 'active'
    )
  );

DROP POLICY IF EXISTS "player_read_own_merchandise_orders" ON public.merchandise_orders;
CREATE POLICY "player_read_own_merchandise_orders" ON public.merchandise_orders
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
