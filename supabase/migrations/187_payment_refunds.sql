-- 187_payment_refunds.sql
-- Refund tracking on payments: how much was returned and when. Reporting
-- treats revenue as GROSS (paid + manual + refunded rows) minus refunds —
-- so a full refund nets to zero instead of silently vanishing, a partial
-- refund keeps the retained portion, and refunds land in the period they
-- were issued (refunded_at), not the period of the original payment.

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS refunded_cents integer NOT NULL DEFAULT 0 CHECK (refunded_cents >= 0),
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz;

-- Rows already marked refunded predate refund amounts — treat them as full
-- refunds dated when the payment record says it settled.
UPDATE public.payments
SET refunded_cents = amount_cents,
    refunded_at = COALESCE(paid_at, created_at)
WHERE status = 'refunded' AND refunded_cents = 0;
