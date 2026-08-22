-- Manual brackets M1: 'custom' as a bracket type on brackets and playoff tiers.
--
-- A custom tier is hand-built: the generators pre-lay a single first round of
-- empty matches when the bracket is first created, and never touch it again —
-- "Generate All Brackets" / "Regenerate from Standings" skip custom tiers, and
-- scaffold/seed refuse to run on a custom bracket. The admin owns the shape:
-- teams are seated with the existing slot tools, routes with the routing
-- editor. (Same two-constraint pattern migration 104 used for 'all_play'.)

ALTER TABLE public.brackets
  DROP CONSTRAINT IF EXISTS brackets_bracket_type_check;

ALTER TABLE public.brackets
  ADD CONSTRAINT brackets_bracket_type_check
    CHECK (bracket_type IN ('single_elimination', 'double_elimination', 'all_play', 'custom'));

ALTER TABLE public.playoff_tiers
  DROP CONSTRAINT IF EXISTS playoff_tiers_bracket_type_check;

ALTER TABLE public.playoff_tiers
  ADD CONSTRAINT playoff_tiers_bracket_type_check
    CHECK (bracket_type IN ('single_elimination', 'double_elimination', 'all_play', 'custom'));
