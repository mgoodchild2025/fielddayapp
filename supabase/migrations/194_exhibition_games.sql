-- Exhibition games: played and scored like any other game (results, live
-- scores, player stats all work), but excluded from every standings fold —
-- lib/standings.ts#countsForStandings is the one rule. Set from the Add/Edit
-- Game forms; badged "Exhibition" on admin, public, and event-page schedules.
ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS is_exhibition boolean NOT NULL DEFAULT false;
