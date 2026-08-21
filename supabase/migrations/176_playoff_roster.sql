-- Playoff roster & persistent seeding (Phase A).
--
-- Standings decide the default playoff field, but admins need two things they
-- couldn't keep before:
--   1. Sit a team out — it drops off the field entirely and every seed below
--      it shifts up (pre-playoff drop-outs, teams that can't make the dates).
--   2. Order the field by hand — reward attendance, split rivals, respect a
--      head-to-head — in an order that SURVIVES reload, re-seed and
--      regeneration. Until now overrides lived only in the browser tab.
--
-- Both live on the config so every later seed/re-seed/regenerate honours the
-- admin's field rather than the raw standings.

ALTER TABLE public.playoff_configs
  -- Ordered team ids = the seeding order. null/empty = use standings order.
  -- Teams present in the league but missing from the list are appended in
  -- standings order, so the column never has to be exhaustive.
  ADD COLUMN IF NOT EXISTS custom_seed_order uuid[],
  -- Teams sitting the playoffs out. Filtered before seeding under EVERY
  -- seeding method, so the remaining teams shift up into the freed seeds.
  ADD COLUMN IF NOT EXISTS excluded_team_ids uuid[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.playoff_configs.custom_seed_order IS
  'Ordered team ids overriding standings order for seeding; unlisted teams append in standings order. Null = standings order.';
COMMENT ON COLUMN public.playoff_configs.excluded_team_ids IS
  'Teams sitting out the playoffs: removed from the field before seeding under every seeding method.';
