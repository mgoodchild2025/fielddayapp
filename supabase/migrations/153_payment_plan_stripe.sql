-- ── Payment plan Stripe tracking ─────────────────────────────────────────────
--
-- Adds a checkout-session dedup column so a second "Pay" click never creates a
-- duplicate Stripe session for an already-in-flight instalment.
-- Also adds a proper FK on payment_id now that instalments are being paid via
-- the standard payments table.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.payment_plan_installments
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text UNIQUE;

-- FK: link paid instalments to their payments row
-- NOT VALID skips the row scan on existing data (all have payment_id = NULL).
ALTER TABLE public.payment_plan_installments
  ADD CONSTRAINT IF NOT EXISTS payment_plan_installments_payment_id_fkey
  FOREIGN KEY (payment_id) REFERENCES public.payments(id)
  ON DELETE SET NULL
  NOT VALID;

COMMENT ON COLUMN public.payment_plan_installments.stripe_checkout_session_id IS
  'Set when a Stripe Checkout session is created for this instalment. '
  'Prevents duplicate sessions from being created on repeated "Pay" clicks.';
