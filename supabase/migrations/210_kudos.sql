-- Kudos: after a game, a player taps a teammate or an opponent and picks a
-- compliment from a fixed list (no free text, so nothing nasty can be
-- written). One kudos per giver → receiver per game; changing it updates the
-- kind. Written and read only by the app's service role.
CREATE TABLE IF NOT EXISTS public.kudos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  league_id       uuid REFERENCES public.leagues(id) ON DELETE CASCADE,
  game_id         uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  from_user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  to_user_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind            text NOT NULL CHECK (kind IN ('great_play', 'hustle', 'good_sport', 'teammate', 'clutch', 'leader')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kudos_not_self CHECK (from_user_id <> to_user_id),
  CONSTRAINT kudos_one_per_pair UNIQUE (game_id, from_user_id, to_user_id)
);

CREATE INDEX IF NOT EXISTS kudos_to_user_idx ON public.kudos (organization_id, to_user_id);
CREATE INDEX IF NOT EXISTS kudos_league_idx ON public.kudos (league_id, to_user_id);

ALTER TABLE public.kudos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kudos FROM anon, authenticated;
DROP POLICY IF EXISTS kudos_service_role ON public.kudos;
CREATE POLICY kudos_service_role ON public.kudos FOR ALL TO service_role USING (true) WITH CHECK (true);
