-- 161_payment_method_and_guest_registrations.sql
--
-- Two changes that support admin-managed payments + manual registrations:
--
-- 1. payments.payment_method allowed 'stripe','cash','etransfer' only, but the
--    UI (Mark as Paid) and league config already offer 'cheque'. Recording a
--    cheque payment actually violated the check. Expand it.
--
-- 2. Manual registrations for people without an app account ("guests"): allow a
--    registration with no user_id and store the person's name/contact inline.

-- ── 1. payment_method constraint ─────────────────────────────────────────────
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_payment_method_check;
ALTER TABLE public.payments
  ADD CONSTRAINT payments_payment_method_check
  CHECK (payment_method IN ('stripe', 'card', 'cash', 'etransfer', 'cheque', 'other'));

-- ── 2. Guest registrations ───────────────────────────────────────────────────
ALTER TABLE public.registrations ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS guest_name      text,
  ADD COLUMN IF NOT EXISTS guest_email     text,
  ADD COLUMN IF NOT EXISTS guest_phone     text,
  ADD COLUMN IF NOT EXISTS added_by_admin  uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.registrations.guest_name IS
  'Name for a manually-added registrant with no app account (user_id IS NULL).';
COMMENT ON COLUMN public.registrations.added_by_admin IS
  'Admin who created a manual registration, if any.';

-- The unique(league_id, user_id) constraint still holds: Postgres treats NULL
-- user_ids as distinct, so multiple guest registrations per league are allowed.
