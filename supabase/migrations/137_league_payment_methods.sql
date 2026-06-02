-- Per-league accepted payment methods + optional per-league offline instructions.
-- NULL payment_methods = legacy behaviour (derive from org_payment_settings), so
-- existing leagues are unchanged until an admin explicitly configures methods.
ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS payment_methods text[],
  ADD COLUMN IF NOT EXISTS payment_instructions text;

-- Optional guard: only allow known method keys in the array.
ALTER TABLE public.leagues DROP CONSTRAINT IF EXISTS leagues_payment_methods_valid;
ALTER TABLE public.leagues ADD CONSTRAINT leagues_payment_methods_valid
  CHECK (
    payment_methods IS NULL OR
    payment_methods <@ ARRAY['card','etransfer','cash','cheque']::text[]
  );
