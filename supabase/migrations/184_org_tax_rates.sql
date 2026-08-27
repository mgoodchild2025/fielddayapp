-- Tax on purchases (X1).
--
-- Orgs define named tax rates ("HST 13%") once; every checkout applies them.
-- Each rate is mirrored as a real Stripe Tax Rate object in the ORG'S OWN
-- Stripe account (stripe_tax_rate_id), attached to line items so Stripe does
-- the math and receipts itemize the tax by name. Two active rates may apply
-- together (GST + PST provinces). applies_to scopes registrations vs merch,
-- which some provinces tax differently. Inclusive rates are supported
-- natively by Stripe; offline (cash/e-transfer) payments compute the same
-- split via lib/tax.ts.
--
-- Rule of application, everywhere: subtotal → discounts → tax.

CREATE TABLE IF NOT EXISTS public.org_tax_rates (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  display_name        text        NOT NULL,                       -- "HST", "GST", "PST"
  percentage          numeric     NOT NULL CHECK (percentage > 0 AND percentage <= 100),
  inclusive           boolean     NOT NULL DEFAULT false,         -- price already contains the tax
  applies_to          text        NOT NULL DEFAULT 'all' CHECK (applies_to IN ('all', 'registrations', 'merch')),
  stripe_tax_rate_id  text,                                       -- created in the org's Stripe account
  active              boolean     NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS org_tax_rates_org_idx
  ON public.org_tax_rates (organization_id) WHERE active;

ALTER TABLE public.org_tax_rates ENABLE ROW LEVEL SECURITY;

-- Rates are shown on public price displays ("+ HST 13%"), so readable;
-- writes go through admin-guarded server actions on the service role.
DROP POLICY IF EXISTS "org_tax_rates_read" ON public.org_tax_rates;
CREATE POLICY "org_tax_rates_read" ON public.org_tax_rates FOR SELECT USING (true);

-- Every payment keeps the tax split out for the org's books.
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS tax_cents integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.payments.tax_cents IS
  'Tax portion of amount_cents (amount_cents is the gross charge). 0 = untaxed.';
