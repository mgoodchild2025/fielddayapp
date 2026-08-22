-- The Trophy Case: medals awarded from playoff results.
--
-- Medals are AWARDED AND FROZEN, not derived at page load: the recipient rows
-- snapshot the team roster at award time (the 2026 medal lists the 2026
-- teammates forever), the medal survives bracket regeneration/deletion, and
-- per-player queries are one indexed read. The award pass
-- (awardLeagueMedals, actions/medals.ts) is idempotent — it replaces the
-- league's medals — and runs automatically when an event is marked completed.

CREATE TABLE IF NOT EXISTS public.medals (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  league_id         uuid        NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  -- Snapshots: the medal outlives renames and deletions of what it points at
  league_name       text        NOT NULL,
  team_id           uuid        REFERENCES public.teams(id) ON DELETE SET NULL,
  team_name         text        NOT NULL,
  placement         text        NOT NULL CHECK (placement IN ('gold', 'silver', 'bronze', 'tier_champion')),
  -- Display label: "Champions", "Finalists", "Third Place", "Silver Champion"
  label             text        NOT NULL,
  -- The match that decided it (for the "view the bracket" link); nullable so
  -- the medal survives bracket deletion
  bracket_id        uuid        REFERENCES public.brackets(id) ON DELETE SET NULL,
  deciding_match_id uuid        REFERENCES public.bracket_matches(id) ON DELETE SET NULL,
  awarded_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS medals_league_idx ON public.medals (league_id);
CREATE INDEX IF NOT EXISTS medals_team_idx   ON public.medals (team_id) WHERE team_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS medals_org_idx    ON public.medals (organization_id, awarded_at DESC);

CREATE TABLE IF NOT EXISTS public.medal_recipients (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medal_id         uuid NOT NULL REFERENCES public.medals(id) ON DELETE CASCADE,
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- Nullable: the medal row (with display_name) survives account deletion
  user_id          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  display_name     text NOT NULL,
  UNIQUE (medal_id, user_id)
);

CREATE INDEX IF NOT EXISTS medal_recipients_user_idx
  ON public.medal_recipients (organization_id, user_id) WHERE user_id IS NOT NULL;

-- RLS: medals are as public as the pages they sit on (team pages are public);
-- all writes go through admin-guarded server actions on the service role.
ALTER TABLE public.medals           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medal_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "medals_read" ON public.medals;
CREATE POLICY "medals_read" ON public.medals FOR SELECT USING (true);

DROP POLICY IF EXISTS "medal_recipients_read" ON public.medal_recipients;
CREATE POLICY "medal_recipients_read" ON public.medal_recipients FOR SELECT USING (true);
