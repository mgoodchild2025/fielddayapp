-- ============================================================================
-- Migration 089: Restore missing read / public policies
--
-- Migration 087 dropped all RLS policies to replace auth.uid() with
-- (SELECT auth.uid()).  Migration 088 re-created the admin/write/service
-- policies but inadvertently omitted all of the "read" and "public" policies
-- from 001_initial_schema.sql.  Without these policies the only rows visible
-- to regular users were whatever the FOR ALL admin policies covered.
--
-- This migration re-creates every missing policy with the
-- (SELECT auth.uid()) optimisation applied where relevant.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- public.organizations — public read + member read
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "orgs_read_public"    ON public.organizations;
DROP POLICY IF EXISTS "orgs_read_by_member" ON public.organizations;

CREATE POLICY "orgs_read_public" ON public.organizations
  FOR SELECT USING (status = 'active');

-- is_org_member is a SECURITY DEFINER helper; the auth.uid() inside it is
-- already evaluated once per call by the planner, so no change needed there.
CREATE POLICY "orgs_read_by_member" ON public.organizations
  FOR SELECT USING (public.is_org_member(id));


-- ─────────────────────────────────────────────────────────────────────────────
-- public.org_members — all members of the org can read the membership list
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "org_members_read_own_org" ON public.org_members;

CREATE POLICY "org_members_read_own_org" ON public.org_members
  FOR SELECT USING (organization_id = current_org_id());


-- ─────────────────────────────────────────────────────────────────────────────
-- public.org_branding — public read (needed for middleware domain resolution)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "org_branding_public_read" ON public.org_branding;

CREATE POLICY "org_branding_public_read" ON public.org_branding
  FOR SELECT USING (true);


-- ─────────────────────────────────────────────────────────────────────────────
-- public.subscriptions — org members can read their own
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "subscriptions_read" ON public.subscriptions;

CREATE POLICY "subscriptions_read" ON public.subscriptions
  FOR SELECT USING (organization_id = current_org_id());


-- ─────────────────────────────────────────────────────────────────────────────
-- public.leagues — public read for non-draft leagues
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "leagues_public_read" ON public.leagues;

CREATE POLICY "leagues_public_read" ON public.leagues
  FOR SELECT USING (
    organization_id = current_org_id()
    AND status != 'draft'
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- public.divisions — org members can read
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "divisions_read" ON public.divisions;

CREATE POLICY "divisions_read" ON public.divisions
  FOR SELECT USING (organization_id = current_org_id());


-- ─────────────────────────────────────────────────────────────────────────────
-- public.teams — org members can read
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "teams_read" ON public.teams;

CREATE POLICY "teams_read" ON public.teams
  FOR SELECT USING (organization_id = current_org_id());


-- ─────────────────────────────────────────────────────────────────────────────
-- public.team_members — org members can read
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "team_members_read" ON public.team_members;

CREATE POLICY "team_members_read" ON public.team_members
  FOR SELECT USING (organization_id = current_org_id());


-- ─────────────────────────────────────────────────────────────────────────────
-- public.waivers — org members can read
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "waivers_read" ON public.waivers;

CREATE POLICY "waivers_read" ON public.waivers
  FOR SELECT USING (organization_id = current_org_id());


-- ─────────────────────────────────────────────────────────────────────────────
-- public.games — org members can read
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "games_read" ON public.games;

CREATE POLICY "games_read" ON public.games
  FOR SELECT USING (organization_id = current_org_id());


-- ─────────────────────────────────────────────────────────────────────────────
-- public.game_results — read + captain submit/confirm
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "game_results_read"             ON public.game_results;
DROP POLICY IF EXISTS "game_results_captain_insert"   ON public.game_results;
DROP POLICY IF EXISTS "game_results_captain_confirm"  ON public.game_results;

CREATE POLICY "game_results_read" ON public.game_results
  FOR SELECT USING (organization_id = current_org_id());

CREATE POLICY "game_results_captain_insert" ON public.game_results
  FOR INSERT WITH CHECK (
    organization_id = current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.team_members tm
      JOIN public.games g ON g.id = game_results.game_id
      WHERE (tm.team_id = g.home_team_id OR tm.team_id = g.away_team_id)
        AND tm.user_id = (SELECT auth.uid())
        AND tm.role = 'captain'
    )
  );

CREATE POLICY "game_results_captain_confirm" ON public.game_results
  FOR UPDATE USING (
    organization_id = current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.team_members tm
      JOIN public.games g ON g.id = game_results.game_id
      WHERE (tm.team_id = g.home_team_id OR tm.team_id = g.away_team_id)
        AND tm.user_id = (SELECT auth.uid())
        AND tm.role = 'captain'
    )
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- public.announcements — org members can read
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "announcements_read" ON public.announcements;

CREATE POLICY "announcements_read" ON public.announcements
  FOR SELECT USING (organization_id = current_org_id());


-- ─────────────────────────────────────────────────────────────────────────────
-- public.notifications — users see only their own
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "notifications_own" ON public.notifications;

CREATE POLICY "notifications_own" ON public.notifications
  FOR ALL USING (
    organization_id = current_org_id()
    AND user_id = (SELECT auth.uid())
  );
