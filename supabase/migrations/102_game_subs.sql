-- Game-level substitute player invitations.
-- A game sub is invited for one specific game; they skip payment but must sign the waiver.
-- Roster subs (role='sub' in team_members) continue to use the existing team_invitations flow.

CREATE TABLE IF NOT EXISTS public.game_subs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  game_id             uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  team_id             uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  invited_by          uuid NOT NULL REFERENCES public.profiles(id),
  user_id             uuid REFERENCES public.profiles(id),    -- null until the invite is claimed
  invited_email       text NOT NULL,
  status              text NOT NULL DEFAULT 'invited'
                        CHECK (status IN ('invited', 'confirmed', 'declined')),
  waiver_signature_id uuid REFERENCES public.waiver_signatures(id),
  token               uuid NOT NULL DEFAULT gen_random_uuid(),
  message             text,
  expires_at          timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT game_subs_token_unique UNIQUE (token)
);

-- Only one active (non-declined) invite per email per game per team
CREATE UNIQUE INDEX IF NOT EXISTS game_subs_pending_email_unique
  ON public.game_subs(game_id, team_id, lower(invited_email))
  WHERE status = 'invited';

-- Only one confirmed entry per user per game per team
CREATE UNIQUE INDEX IF NOT EXISTS game_subs_confirmed_user_unique
  ON public.game_subs(game_id, team_id, user_id)
  WHERE user_id IS NOT NULL AND status = 'confirmed';

CREATE INDEX IF NOT EXISTS game_subs_game_id_idx ON public.game_subs(game_id);
CREATE INDEX IF NOT EXISTS game_subs_user_id_idx  ON public.game_subs(user_id);

ALTER TABLE public.game_subs ENABLE ROW LEVEL SECURITY;

-- Team captains/coaches and org admins can fully manage game subs
DROP POLICY IF EXISTS "captain_manage_game_subs" ON public.game_subs;
CREATE POLICY "captain_manage_game_subs" ON public.game_subs
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id  = game_subs.team_id
        AND tm.user_id  = (SELECT auth.uid())
        AND tm.role     IN ('captain', 'coach')
        AND tm.status   = 'active'
    )
    OR EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.organization_id = game_subs.organization_id
        AND om.user_id         = (SELECT auth.uid())
        AND om.role            IN ('org_admin', 'league_admin')
    )
  );

-- Any org member can read game_subs (to see sub list on game cards / schedule)
DROP POLICY IF EXISTS "org_member_read_game_subs" ON public.game_subs;
CREATE POLICY "org_member_read_game_subs" ON public.game_subs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.organization_id = game_subs.organization_id
        AND om.user_id         = (SELECT auth.uid())
    )
  );

-- A confirmed sub can read and update their own row (confirm / decline via token)
DROP POLICY IF EXISTS "sub_manage_own" ON public.game_subs;
CREATE POLICY "sub_manage_own" ON public.game_subs
  FOR ALL
  USING (user_id = (SELECT auth.uid()));
