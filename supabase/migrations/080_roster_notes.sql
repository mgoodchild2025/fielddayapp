-- Lightweight planning notes for team rosters.
-- These are NOT real team members — no auth user, no registration, no payment.
-- Captains and org admins use this to plan who they expect to join the team.
-- An optional email enables the "Invite" shortcut which creates a real team invite.

CREATE TABLE IF NOT EXISTS public.roster_notes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  team_id         uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  name            text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  email           text,
  note            text CHECK (char_length(note) <= 500),
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS roster_notes_team_id_idx
  ON public.roster_notes (team_id);

ALTER TABLE public.roster_notes ENABLE ROW LEVEL SECURITY;

-- Org admins and league admins can manage any team's roster notes for their org
DROP POLICY IF EXISTS "admins_manage_roster_notes" ON public.roster_notes;
CREATE POLICY "admins_manage_roster_notes" ON public.roster_notes
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.organization_id = roster_notes.organization_id
        AND om.user_id = auth.uid()
        AND om.role IN ('org_admin', 'league_admin')
        AND om.status = 'active'
    )
  );

-- Captains and coaches can manage roster notes for their own team
DROP POLICY IF EXISTS "captains_manage_roster_notes" ON public.roster_notes;
CREATE POLICY "captains_manage_roster_notes" ON public.roster_notes
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = roster_notes.team_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('captain', 'coach')
        AND tm.status = 'active'
    )
  );
