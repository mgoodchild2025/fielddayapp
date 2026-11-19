-- 206_pool_places_seeding.sql
-- 'pool_places': every pool winner, then every runner-up, then every 3rd…,
-- best record first within a place. "Top 2 per pool + the best 2 third
-- places" to Gold, the rest to Silver.
ALTER TABLE public.playoff_configs DROP CONSTRAINT IF EXISTS playoff_configs_seeding_method_check;
ALTER TABLE public.playoff_configs ADD CONSTRAINT playoff_configs_seeding_method_check
  CHECK (seeding_method IN ('standings', 'manual', 'pool_results', 'pool_results_alternating', 'pool_tiers', 'pool_results_flat', 'pool_places'));

ALTER TABLE public.brackets DROP CONSTRAINT IF EXISTS brackets_seeding_method_check;
ALTER TABLE public.brackets ADD CONSTRAINT brackets_seeding_method_check
  CHECK (seeding_method IN ('standings', 'manual', 'pool_results', 'pool_results_alternating', 'pool_tiers', 'pool_results_flat', 'pool_places'));
