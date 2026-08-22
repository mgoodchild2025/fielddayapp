-- Manual brackets: medal matches.
--
-- A hand-built bracket has no generator to say which match decides the title.
-- The admin can now mark one match as the GOLD medal match and one as the
-- BRONZE medal match. Display follows podium convention: the gold match's
-- winner takes gold and its loser takes silver; the bronze match's winner
-- takes bronze. One of each per bracket, enforced by a partial unique index.

ALTER TABLE public.bracket_matches
  ADD COLUMN IF NOT EXISTS medal_match text
    CHECK (medal_match IN ('gold', 'bronze'));

CREATE UNIQUE INDEX IF NOT EXISTS bracket_matches_one_medal_per_bracket
  ON public.bracket_matches (bracket_id, medal_match)
  WHERE medal_match IS NOT NULL;

COMMENT ON COLUMN public.bracket_matches.medal_match IS
  'Marks the match that decides gold (winner=gold, loser=silver) or bronze (winner=bronze). One of each per bracket.';
