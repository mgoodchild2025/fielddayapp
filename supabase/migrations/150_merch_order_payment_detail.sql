-- Store who collected manual payment and what method was used,
-- independently of the notes field.
ALTER TABLE public.merchandise_orders
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS paid_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
