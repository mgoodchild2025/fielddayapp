-- Track team ordering within a pool
ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS pool_sort_order integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS teams_pool_sort_order_idx
  ON public.teams (pool_id, pool_sort_order)
  WHERE pool_id IS NOT NULL;
