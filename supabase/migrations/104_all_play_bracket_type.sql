-- Add 'all_play' as a valid bracket_type for the all-play + best-loser wild card format.
-- In this format every team plays in round 1 (no byes); winners advance plus the best
-- losing team earns a wild card slot determined after round 1 is complete.

-- Update brackets table constraint
ALTER TABLE public.brackets
  DROP CONSTRAINT IF EXISTS brackets_bracket_type_check;

ALTER TABLE public.brackets
  ADD CONSTRAINT brackets_bracket_type_check
    CHECK (bracket_type IN ('single_elimination', 'double_elimination', 'all_play'));

-- Update playoff_tiers table constraint (was missing 'all_play')
ALTER TABLE public.playoff_tiers
  DROP CONSTRAINT IF EXISTS playoff_tiers_bracket_type_check;

ALTER TABLE public.playoff_tiers
  ADD CONSTRAINT playoff_tiers_bracket_type_check
    CHECK (bracket_type IN ('single_elimination', 'double_elimination', 'all_play'));
