-- Migration: team payment support
-- Adds team_id + payment_type to payments, relaxes user_id NOT NULL for team payments

-- 1. Allow user_id to be null (team payments are not tied to a single user)
ALTER TABLE public.payments ALTER COLUMN user_id DROP NOT NULL;

-- 2. Add team_id FK (null for per-player payments)
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL;

-- 3. Distinguish player payments from team payments
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS payment_type text NOT NULL DEFAULT 'player'
    CHECK (payment_type IN ('player', 'team'));

-- 4. Index for team payment lookups
CREATE INDEX IF NOT EXISTS payments_team_id_idx ON public.payments(team_id);
CREATE INDEX IF NOT EXISTS payments_payment_type_idx ON public.payments(payment_type);
