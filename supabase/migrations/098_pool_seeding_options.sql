-- Extend seeding_method CHECK constraint on playoff_configs to include pool variants
ALTER TABLE public.playoff_configs
  DROP CONSTRAINT IF EXISTS playoff_configs_seeding_method_check;
ALTER TABLE public.playoff_configs
  ADD CONSTRAINT playoff_configs_seeding_method_check
  CHECK (seeding_method IN ('standings', 'manual', 'pool_results', 'pool_results_alternating', 'pool_tiers'));

-- Extend seeding_method CHECK constraint on brackets to match
ALTER TABLE public.brackets
  DROP CONSTRAINT IF EXISTS brackets_seeding_method_check;
ALTER TABLE public.brackets
  ADD CONSTRAINT brackets_seeding_method_check
  CHECK (seeding_method IN ('standings', 'pool_results', 'pool_results_alternating', 'pool_tiers', 'manual'));

-- Per-pool advance counts: JSONB array of ints, e.g. [5, 5] or [3, 2]
-- NULL means equal distribution across pools
ALTER TABLE public.playoff_configs
  ADD COLUMN IF NOT EXISTS advance_per_pool jsonb;
