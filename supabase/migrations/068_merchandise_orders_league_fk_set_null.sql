-- When a league is deleted, preserve its merchandise orders but clear the
-- league reference (league_id is already nullable since migration 060).
ALTER TABLE public.merchandise_orders
  DROP CONSTRAINT IF EXISTS merchandise_orders_league_id_fkey;

ALTER TABLE public.merchandise_orders
  ADD CONSTRAINT merchandise_orders_league_id_fkey
    FOREIGN KEY (league_id)
    REFERENCES public.leagues(id)
    ON DELETE SET NULL;
