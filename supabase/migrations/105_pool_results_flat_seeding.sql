-- Add 'pool_results_flat' as a valid seeding_method.
-- This method ranks all teams together by pool-play record (cross-pool flat ranking),
-- ignoring pool boundaries. Used for multi-tier brackets where Tier 1 gets the top N
-- teams and Tier 2 gets the next N, purely by pool-play W/L/D record.

-- Update playoff_configs seeding_method constraint
ALTER TABLE public.playoff_configs
  DROP CONSTRAINT IF EXISTS playoff_configs_seeding_method_check;

ALTER TABLE public.playoff_configs
  ADD CONSTRAINT playoff_configs_seeding_method_check
    CHECK (seeding_method IN (
      'standings', 'manual',
      'pool_results', 'pool_results_alternating', 'pool_tiers', 'pool_results_flat'
    ));

-- Update brackets seeding_method constraint
ALTER TABLE public.brackets
  DROP CONSTRAINT IF EXISTS brackets_seeding_method_check;

ALTER TABLE public.brackets
  ADD CONSTRAINT brackets_seeding_method_check
    CHECK (seeding_method IN (
      'standings', 'manual',
      'pool_results', 'pool_results_alternating', 'pool_tiers', 'pool_results_flat'
    ));
