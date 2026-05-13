-- ============================================================================
-- Migration 087: Fix RLS auth function performance warnings
--
-- Supabase warns when auth.uid() or auth.role() are called bare inside a
-- policy USING / WITH CHECK expression — they are re-evaluated for every row.
-- The fix is to wrap each call in a subquery so Postgres caches the result:
--   auth.uid()  → (select auth.uid())
--   auth.role() → (select auth.role())
--
-- This migration drops and recreates every affected policy.  Policy logic is
-- unchanged; only the auth.uid() / auth.role() call sites are wrapped.
-- ============================================================================


-- ============================================================================
-- public.profiles  (001_initial_schema)
-- ============================================================================

DROP POLICY IF EXISTS "profiles_self_read"   ON public.profiles;
DROP POLICY IF EXISTS "profiles_self_update" ON public.profiles;
DROP POLICY IF EXISTS "profiles_service_all" ON public.profiles;

CREATE POLICY "profiles_self_read" ON public.profiles
  FOR SELECT USING (id = (SELECT auth.uid()));

CREATE POLICY "profiles_self_update" ON public.profiles
  FOR UPDATE USING (id = (SELECT auth.uid()));

CREATE POLICY "profiles_service_all" ON public.profiles
  FOR ALL USING ((SELECT auth.role()) = 'service_role');


-- ============================================================================
-- public.organizations  (001_initial_schema)
-- ============================================================================

DROP POLICY IF EXISTS "orgs_service_all" ON public.organizations;

CREATE POLICY "orgs_service_all" ON public.organizations
  FOR ALL USING ((SELECT auth.role()) = 'service_role');


-- ============================================================================
-- public.org_members  (001_initial_schema)
-- ============================================================================

DROP POLICY IF EXISTS "org_members_admin_all"    ON public.org_members;
DROP POLICY IF EXISTS "org_members_service_all"  ON public.org_members;

CREATE POLICY "org_members_admin_all" ON public.org_members
  FOR ALL USING (
    organization_id = current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.org_members om2
      WHERE om2.organization_id = current_org_id()
        AND om2.user_id = (SELECT auth.uid())
        AND om2.role IN ('org_admin', 'league_admin')
    )
  );

CREATE POLICY "org_members_service_all" ON public.org_members
  FOR ALL USING ((SELECT auth.role()) = 'service_role');


-- ============================================================================
-- public.org_branding  (001_initial_schema)
-- ============================================================================

DROP POLICY IF EXISTS "org_branding_admin_update" ON public.org_branding;
DROP POLICY IF EXISTS "org_branding_service_all"  ON public.org_branding;

CREATE POLICY "org_branding_admin_update" ON public.org_branding
  FOR UPDATE USING (
    organization_id = current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.organization_id = current_org_id()
        AND org_members.user_id = (SELECT auth.uid())
        AND org_members.role = 'org_admin'
    )
  );

CREATE POLICY "org_branding_service_all" ON public.org_branding
  FOR ALL USING ((SELECT auth.role()) = 'service_role');


-- ============================================================================
-- public.subscriptions  (001_initial_schema)
-- ============================================================================

DROP POLICY IF EXISTS "subscriptions_service_all" ON public.subscriptions;

CREATE POLICY "subscriptions_service_all" ON public.subscriptions
  FOR ALL USING ((SELECT auth.role()) = 'service_role');


-- ============================================================================
-- public.leagues  (001_initial_schema)
-- ============================================================================

DROP POLICY IF EXISTS "leagues_draft_admin_read" ON public.leagues;
DROP POLICY IF EXISTS "leagues_admin_write"      ON public.leagues;
DROP POLICY IF EXISTS "leagues_service_all"      ON public.leagues;

CREATE POLICY "leagues_draft_admin_read" ON public.leagues
  FOR SELECT USING (
    organization_id = current_org_id()
    AND status = 'draft'
    AND EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.organization_id = current_org_id()
        AND org_members.user_id = (SELECT auth.uid())
        AND org_members.role IN ('org_admin', 'league_admin')
    )
  );

CREATE POLICY "leagues_admin_write" ON public.leagues
  FOR ALL USING (
    organization_id = current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.organization_id = current_org_id()
        AND org_members.user_id = (SELECT auth.uid())
        AND org_members.role IN ('org_admin', 'league_admin')
    )
  );

CREATE POLICY "leagues_service_all" ON public.leagues
  FOR ALL USING ((SELECT auth.role()) = 'service_role');


-- ============================================================================
-- public.divisions  (001_initial_schema)
-- ============================================================================

DROP POLICY IF EXISTS "divisions_admin_write" ON public.divisions;
DROP POLICY IF EXISTS "divisions_service_all" ON public.divisions;

CREATE POLICY "divisions_admin_write" ON public.divisions
  FOR ALL USING (
    organization_id = current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.organization_id = current_org_id()
        AND org_members.user_id = (SELECT auth.uid())
        AND org_members.role IN ('org_admin', 'league_admin')
    )
  );

CREATE POLICY "divisions_service_all" ON public.divisions
  FOR ALL USING ((SELECT auth.role()) = 'service_role');


-- ============================================================================
-- public.teams  (001_initial_schema)
-- ============================================================================

DROP POLICY IF EXISTS "teams_member_insert" ON public.teams;
DROP POLICY IF EXISTS "teams_admin_all"     ON public.teams;
DROP POLICY IF EXISTS "teams_service_all"   ON public.teams;

CREATE POLICY "teams_member_insert" ON public.teams
  FOR INSERT WITH CHECK (
    organization_id = current_org_id()
    AND (SELECT auth.uid()) IS NOT NULL
  );

CREATE POLICY "teams_admin_all" ON public.teams
  FOR ALL USING (
    organization_id = current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.organization_id = current_org_id()
        AND org_members.user_id = (SELECT auth.uid())
        AND org_members.role IN ('org_admin', 'league_admin')
    )
  );

CREATE POLICY "teams_service_all" ON public.teams
  FOR ALL USING ((SELECT auth.role()) = 'service_role');


-- ============================================================================
-- public.team_members  (001_initial_schema)
-- ============================================================================

DROP POLICY IF EXISTS "team_members_captain_insert" ON public.team_members;
DROP POLICY IF EXISTS "team_members_admin_all"      ON public.team_members;
DROP POLICY IF EXISTS "team_members_service_all"    ON public.team_members;

CREATE POLICY "team_members_captain_insert" ON public.team_members
  FOR INSERT WITH CHECK (
    organization_id = current_org_id()
    AND (SELECT auth.uid()) IS NOT NULL
  );

CREATE POLICY "team_members_admin_all" ON public.team_members
  FOR ALL USING (
    organization_id = current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.organization_id = current_org_id()
        AND org_members.user_id = (SELECT auth.uid())
        AND org_members.role IN ('org_admin', 'league_admin')
    )
  );

CREATE POLICY "team_members_service_all" ON public.team_members
  FOR ALL USING ((SELECT auth.role()) = 'service_role');


-- ============================================================================
-- public.waivers  (001_initial_schema)
-- ============================================================================

DROP POLICY IF EXISTS "waivers_admin_write" ON public.waivers;
DROP POLICY IF EXISTS "waivers_service_all" ON public.waivers;

CREATE POLICY "waivers_admin_write" ON public.waivers
  FOR ALL USING (
    organization_id = current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.organization_id = current_org_id()
        AND org_members.user_id = (SELECT auth.uid())
        AND org_members.role IN ('org_admin', 'league_admin')
    )
  );

CREATE POLICY "waivers_service_all" ON public.waivers
  FOR ALL USING ((SELECT auth.role()) = 'service_role');


-- ============================================================================
-- public.waiver_signatures  (001_initial_schema)
-- ============================================================================

DROP POLICY IF EXISTS "waiver_signatures_own"        ON public.waiver_signatures;
DROP POLICY IF EXISTS "waiver_signatures_insert"     ON public.waiver_signatures;
DROP POLICY IF EXISTS "waiver_signatures_admin_read" ON public.waiver_signatures;
DROP POLICY IF EXISTS "waiver_signatures_service_all" ON public.waiver_signatures;

CREATE POLICY "waiver_signatures_own" ON public.waiver_signatures
  FOR SELECT USING (
    organization_id = current_org_id()
    AND user_id = (SELECT auth.uid())
  );

CREATE POLICY "waiver_signatures_insert" ON public.waiver_signatures
  FOR INSERT WITH CHECK (
    organization_id = current_org_id()
    AND user_id = (SELECT auth.uid())
  );

CREATE POLICY "waiver_signatures_admin_read" ON public.waiver_signatures
  FOR SELECT USING (
    organization_id = current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.organization_id = current_org_id()
        AND org_members.user_id = (SELECT auth.uid())
        AND org_members.role IN ('org_admin', 'league_admin')
    )
  );

CREATE POLICY "waiver_signatures_service_all" ON public.waiver_signatures
  FOR ALL USING ((SELECT auth.role()) = 'service_role');


-- ============================================================================
-- public.registrations  (001_initial_schema)
-- ============================================================================

DROP POLICY IF EXISTS "registrations_own"        ON public.registrations;
DROP POLICY IF EXISTS "registrations_insert"     ON public.registrations;
DROP POLICY IF EXISTS "registrations_admin_all"  ON public.registrations;
DROP POLICY IF EXISTS "registrations_service_all" ON public.registrations;

CREATE POLICY "registrations_own" ON public.registrations
  FOR SELECT USING (
    organization_id = current_org_id()
    AND user_id = (SELECT auth.uid())
  );

CREATE POLICY "registrations_insert" ON public.registrations
  FOR INSERT WITH CHECK (
    organization_id = current_org_id()
    AND user_id = (SELECT auth.uid())
  );

CREATE POLICY "registrations_admin_all" ON public.registrations
  FOR ALL USING (
    organization_id = current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.organization_id = current_org_id()
        AND org_members.user_id = (SELECT auth.uid())
        AND org_members.role IN ('org_admin', 'league_admin')
    )
  );

CREATE POLICY "registrations_service_all" ON public.registrations
  FOR ALL USING ((SELECT auth.role()) = 'service_role');


-- ============================================================================
-- public.player_details  (001_initial_schema)
-- ============================================================================

DROP POLICY IF EXISTS "player_details_own"        ON public.player_details;
DROP POLICY IF EXISTS "player_details_admin_read" ON public.player_details;
DROP POLICY IF EXISTS "player_details_service_all" ON public.player_details;

CREATE POLICY "player_details_own" ON public.player_details
  FOR ALL USING (
    organization_id = current_org_id()
    AND user_id = (SELECT auth.uid())
  );

CREATE POLICY "player_details_admin_read" ON public.player_details
  FOR SELECT USING (
    organization_id = current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.organization_id = current_org_id()
        AND org_members.user_id = (SELECT auth.uid())
        AND org_members.role IN ('org_admin', 'league_admin')
    )
  );

CREATE POLICY "player_details_service_all" ON public.player_details
  FOR ALL USING ((SELECT auth.role()) = 'service_role');


-- ============================================================================
-- public.payments  (001_initial_schema)
-- ============================================================================

DROP POLICY IF EXISTS "payments_own"        ON public.payments;
DROP POLICY IF EXISTS "payments_admin_all"  ON public.payments;
DROP POLICY IF EXISTS "payments_service_all" ON public.payments;

CREATE POLICY "payments_own" ON public.payments
  FOR SELECT USING (
    organization_id = current_org_id()
    AND user_id = (SELECT auth.uid())
  );

CREATE POLICY "payments_admin_all" ON public.payments
  FOR ALL USING (
    organization_id = current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.organization_id = current_org_id()
        AND org_members.user_id = (SELECT auth.uid())
        AND org_members.role IN ('org_admin', 'league_admin')
    )
  );

CREATE POLICY "payments_service_all" ON public.payments
  FOR ALL USING ((SELECT auth.role()) = 'service_role');


-- ============================================================================
-- public.games  (001_initial_schema)
-- ============================================================================

DROP POLICY IF EXISTS "games_admin_write"  ON public.games;
DROP POLICY IF EXISTS "games_service_all"  ON public.games;

CREATE POLICY "games_admin_write" ON public.games
  FOR ALL USING (
    organization_id = current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.organization_id = current_org_id()
        AND org_members.user_id = (SELECT auth.uid())
        AND org_members.role IN ('org_admin', 'league_admin')
    )
  );

CREATE POLICY "games_service_all" ON public.games
  FOR ALL USING ((SELECT auth.role()) = 'service_role');


-- ============================================================================
-- public.game_results  (001_initial_schema)
-- ============================================================================

DROP POLICY IF EXISTS "game_results_captain_insert"  ON public.game_results;
DROP POLICY IF EXISTS "game_results_captain_confirm" ON public.game_results;
DROP POLICY IF EXISTS "game_results_admin_all"       ON public.game_results;
DROP POLICY IF EXISTS "game_results_service_all"     ON public.game_results;

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

CREATE POLICY "game_results_admin_all" ON public.game_results
  FOR ALL USING (
    organization_id = current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.organization_id = current_org_id()
        AND org_members.user_id = (SELECT auth.uid())
        AND org_members.role IN ('org_admin', 'league_admin')
    )
  );

CREATE POLICY "game_results_service_all" ON public.game_results
  FOR ALL USING ((SELECT auth.role()) = 'service_role');


-- ============================================================================
-- public.announcements  (001_initial_schema)
-- ============================================================================

DROP POLICY IF EXISTS "announcements_admin_write" ON public.announcements;
DROP POLICY IF EXISTS "announcements_service_all" ON public.announcements;

CREATE POLICY "announcements_admin_write" ON public.announcements
  FOR ALL USING (
    organization_id = current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.organization_id = current_org_id()
        AND org_members.user_id = (SELECT auth.uid())
        AND org_members.role IN ('org_admin', 'league_admin')
    )
  );

CREATE POLICY "announcements_service_all" ON public.announcements
  FOR ALL USING ((SELECT auth.role()) = 'service_role');


-- ============================================================================
-- public.notifications  (001_initial_schema)
-- ============================================================================

DROP POLICY IF EXISTS "notifications_own"         ON public.notifications;
DROP POLICY IF EXISTS "notifications_service_all" ON public.notifications;

CREATE POLICY "notifications_own" ON public.notifications
  FOR ALL USING (
    organization_id = current_org_id()
    AND user_id = (SELECT auth.uid())
  );

CREATE POLICY "notifications_service_all" ON public.notifications
  FOR ALL USING ((SELECT auth.role()) = 'service_role');


-- ============================================================================
-- public.team_join_requests  (004_apply_pending_changes)
-- ============================================================================

DROP POLICY IF EXISTS "join_requests_self_read"  ON public.team_join_requests;
DROP POLICY IF EXISTS "join_requests_self_insert" ON public.team_join_requests;
DROP POLICY IF EXISTS "join_requests_service_all" ON public.team_join_requests;

CREATE POLICY "join_requests_self_read" ON public.team_join_requests
  FOR SELECT USING (user_id = (SELECT auth.uid()));

CREATE POLICY "join_requests_self_insert" ON public.team_join_requests
  FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "join_requests_service_all" ON public.team_join_requests
  FOR ALL USING ((SELECT auth.role()) = 'service_role');


-- ============================================================================
-- public.league_rule_templates  (005_league_rules)
-- ============================================================================

DROP POLICY IF EXISTS "rule_templates_admin_write" ON public.league_rule_templates;
DROP POLICY IF EXISTS "rule_templates_service_all" ON public.league_rule_templates;

CREATE POLICY "rule_templates_admin_write" ON public.league_rule_templates
  FOR ALL USING (
    organization_id = current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.organization_id = current_org_id()
        AND org_members.user_id = (SELECT auth.uid())
        AND org_members.role IN ('org_admin', 'league_admin')
    )
  );

CREATE POLICY "rule_templates_service_all" ON public.league_rule_templates
  FOR ALL USING ((SELECT auth.role()) = 'service_role');


-- ============================================================================
-- storage.objects – team-logos bucket  (006_team_logos_bucket)
-- ============================================================================

DROP POLICY IF EXISTS "team_logos_service_write"  ON storage.objects;
DROP POLICY IF EXISTS "team_logos_service_update" ON storage.objects;
DROP POLICY IF EXISTS "team_logos_service_delete" ON storage.objects;

CREATE POLICY "team_logos_service_write" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'team-logos'
    AND (SELECT auth.role()) = 'service_role'
  );

CREATE POLICY "team_logos_service_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'team-logos'
    AND (SELECT auth.role()) = 'service_role'
  );

CREATE POLICY "team_logos_service_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'team-logos'
    AND (SELECT auth.role()) = 'service_role'
  );


-- ============================================================================
-- public.drop_in_sessions  (009_phase2)
-- ============================================================================

DROP POLICY IF EXISTS "drop_in_sessions_service" ON public.drop_in_sessions;

CREATE POLICY "drop_in_sessions_service" ON public.drop_in_sessions
  FOR ALL USING ((SELECT auth.role()) = 'service_role');


-- ============================================================================
-- public.drop_in_registrations  (009_phase2)
-- ============================================================================

DROP POLICY IF EXISTS "drop_in_reg_self_read" ON public.drop_in_registrations;
DROP POLICY IF EXISTS "drop_in_reg_service"   ON public.drop_in_registrations;

CREATE POLICY "drop_in_reg_self_read" ON public.drop_in_registrations
  FOR SELECT USING (user_id = (SELECT auth.uid()));

CREATE POLICY "drop_in_reg_service" ON public.drop_in_registrations
  FOR ALL USING ((SELECT auth.role()) = 'service_role');


-- ============================================================================
-- public.discount_codes  (009_phase2)
-- ============================================================================

DROP POLICY IF EXISTS "discount_codes_service" ON public.discount_codes;

CREATE POLICY "discount_codes_service" ON public.discount_codes
  FOR ALL USING ((SELECT auth.role()) = 'service_role');


-- ============================================================================
-- public.payment_plans  (009_phase2)
-- ============================================================================

DROP POLICY IF EXISTS "payment_plans_org_read" ON public.payment_plans;
DROP POLICY IF EXISTS "payment_plans_service"  ON public.payment_plans;

CREATE POLICY "payment_plans_org_read" ON public.payment_plans
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE organization_id = payment_plans.organization_id
        AND user_id = (SELECT auth.uid())
        AND status = 'active'
    )
  );

CREATE POLICY "payment_plans_service" ON public.payment_plans
  FOR ALL USING ((SELECT auth.role()) = 'service_role');


-- ============================================================================
-- public.payment_plan_enrollments  (009_phase2)
-- ============================================================================

DROP POLICY IF EXISTS "enrollment_service" ON public.payment_plan_enrollments;

CREATE POLICY "enrollment_service" ON public.payment_plan_enrollments
  FOR ALL USING ((SELECT auth.role()) = 'service_role');


-- ============================================================================
-- public.payment_plan_installments  (009_phase2)
-- ============================================================================

DROP POLICY IF EXISTS "installments_service" ON public.payment_plan_installments;

CREATE POLICY "installments_service" ON public.payment_plan_installments
  FOR ALL USING ((SELECT auth.role()) = 'service_role');


-- ============================================================================
-- storage.objects – org-branding bucket  (011_org_branding_bucket)
-- ============================================================================

DROP POLICY IF EXISTS "org_branding_service_insert" ON storage.objects;
DROP POLICY IF EXISTS "org_branding_service_update" ON storage.objects;
DROP POLICY IF EXISTS "org_branding_service_delete" ON storage.objects;

CREATE POLICY "org_branding_service_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'org-branding'
    AND (SELECT auth.role()) = 'service_role'
  );

CREATE POLICY "org_branding_service_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'org-branding'
    AND (SELECT auth.role()) = 'service_role'
  );

CREATE POLICY "org_branding_service_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'org-branding'
    AND (SELECT auth.role()) = 'service_role'
  );


-- ============================================================================
-- public.event_sessions  (015_sessions)
-- ============================================================================

DROP POLICY IF EXISTS "event_sessions_admin" ON public.event_sessions;

CREATE POLICY "event_sessions_admin" ON public.event_sessions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.organization_id = event_sessions.organization_id
        AND om.user_id = (SELECT auth.uid())
        AND om.role IN ('org_admin', 'league_admin')
    )
  );


-- ============================================================================
-- public.session_registrations  (015_sessions)
-- ============================================================================

DROP POLICY IF EXISTS "session_reg_insert"     ON public.session_registrations;
DROP POLICY IF EXISTS "session_reg_update_own" ON public.session_registrations;
DROP POLICY IF EXISTS "session_reg_admin"      ON public.session_registrations;

CREATE POLICY "session_reg_insert" ON public.session_registrations
  FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "session_reg_update_own" ON public.session_registrations
  FOR UPDATE USING (user_id = (SELECT auth.uid()));

CREATE POLICY "session_reg_admin" ON public.session_registrations
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.organization_id = session_registrations.organization_id
        AND om.user_id = (SELECT auth.uid())
        AND om.role IN ('org_admin', 'league_admin')
    )
  );


-- ============================================================================
-- public.pools  (016_pools)
-- ============================================================================

DROP POLICY IF EXISTS "pools_admin_write" ON public.pools;
DROP POLICY IF EXISTS "pools_service_all" ON public.pools;

CREATE POLICY "pools_admin_write" ON public.pools
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.organization_id = pools.organization_id
        AND om.user_id = (SELECT auth.uid())
        AND om.role IN ('org_admin', 'league_admin')
    )
  );

CREATE POLICY "pools_service_all" ON public.pools
  FOR ALL USING ((SELECT auth.role()) = 'service_role');


-- ============================================================================
-- public.brackets  (018_brackets)
-- ============================================================================

DROP POLICY IF EXISTS "brackets_admin_all"   ON public.brackets;
DROP POLICY IF EXISTS "brackets_service_all" ON public.brackets;

CREATE POLICY "brackets_admin_all" ON public.brackets
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.organization_id = brackets.organization_id
        AND org_members.user_id = (SELECT auth.uid())
        AND org_members.role IN ('org_admin', 'league_admin')
    )
  );

CREATE POLICY "brackets_service_all" ON public.brackets
  FOR ALL USING ((SELECT auth.role()) = 'service_role');


-- ============================================================================
-- public.bracket_matches  (018_brackets)
-- ============================================================================

DROP POLICY IF EXISTS "bracket_matches_admin_all"   ON public.bracket_matches;
DROP POLICY IF EXISTS "bracket_matches_service_all" ON public.bracket_matches;

CREATE POLICY "bracket_matches_admin_all" ON public.bracket_matches
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.organization_id = bracket_matches.organization_id
        AND org_members.user_id = (SELECT auth.uid())
        AND org_members.role IN ('org_admin', 'league_admin')
    )
  );

CREATE POLICY "bracket_matches_service_all" ON public.bracket_matches
  FOR ALL USING ((SELECT auth.role()) = 'service_role');


-- ============================================================================
-- public.pickup_invites  (022_pickup_invites)
-- ============================================================================

DROP POLICY IF EXISTS "Org admins manage pickup invites" ON public.pickup_invites;

CREATE POLICY "Org admins manage pickup invites" ON public.pickup_invites
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM public.org_members
      WHERE user_id = (SELECT auth.uid())
        AND role IN ('org_admin', 'league_admin')
    )
  );


-- ============================================================================
-- public.league_organizers  (028_league_organizers)
-- ============================================================================

DROP POLICY IF EXISTS "league_organizers_read"         ON public.league_organizers;
DROP POLICY IF EXISTS "league_organizers_read_own"     ON public.league_organizers;
DROP POLICY IF EXISTS "league_organizers_admin_write"  ON public.league_organizers;

CREATE POLICY "league_organizers_read" ON public.league_organizers
  FOR SELECT USING (
    organization_id = (
      SELECT current_setting('app.current_org_id', true)::uuid
    )
    AND EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.organization_id = league_organizers.organization_id
        AND org_members.user_id = (SELECT auth.uid())
        AND org_members.role IN ('org_admin', 'league_admin')
        AND org_members.status = 'active'
    )
  );

CREATE POLICY "league_organizers_read_own" ON public.league_organizers
  FOR SELECT USING (user_id = (SELECT auth.uid()));

CREATE POLICY "league_organizers_admin_write" ON public.league_organizers
  FOR ALL USING (
    organization_id = (
      SELECT current_setting('app.current_org_id', true)::uuid
    )
    AND EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.organization_id = league_organizers.organization_id
        AND org_members.user_id = (SELECT auth.uid())
        AND org_members.role = 'org_admin'
        AND org_members.status = 'active'
    )
  );


-- ============================================================================
-- storage.objects – player-avatars bucket  (036_player_avatars_bucket — latest)
-- ============================================================================

DROP POLICY IF EXISTS "player_avatars_owner_insert" ON storage.objects;
DROP POLICY IF EXISTS "player_avatars_owner_update" ON storage.objects;
DROP POLICY IF EXISTS "player_avatars_owner_delete" ON storage.objects;

-- Note: 036 renamed the insert policy from "player_avatars_owner_write" (029)
-- to "player_avatars_owner_insert". Drop the old name too for safety.
DROP POLICY IF EXISTS "player_avatars_owner_write" ON storage.objects;

CREATE POLICY "player_avatars_owner_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'player-avatars'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

CREATE POLICY "player_avatars_owner_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'player-avatars'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

CREATE POLICY "player_avatars_owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'player-avatars'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );


-- ============================================================================
-- public.org_notification_settings  (032_org_notification_settings)
-- ============================================================================

DROP POLICY IF EXISTS "notif_settings_admin_write" ON public.org_notification_settings;
DROP POLICY IF EXISTS "notif_settings_service_all" ON public.org_notification_settings;

CREATE POLICY "notif_settings_admin_write" ON public.org_notification_settings
  FOR ALL USING (
    organization_id = current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.organization_id = current_org_id()
        AND org_members.user_id = (SELECT auth.uid())
        AND org_members.role = 'org_admin'
    )
  );

CREATE POLICY "notif_settings_service_all" ON public.org_notification_settings
  FOR ALL USING ((SELECT auth.role()) = 'service_role');


-- ============================================================================
-- public.org_sms_reminders  (033_multi_sms_reminders)
-- ============================================================================

DROP POLICY IF EXISTS "sms_reminders_admin_write" ON public.org_sms_reminders;
DROP POLICY IF EXISTS "sms_reminders_service_all" ON public.org_sms_reminders;

CREATE POLICY "sms_reminders_admin_write" ON public.org_sms_reminders
  FOR ALL USING (
    organization_id = current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.organization_id = current_org_id()
        AND org_members.user_id = (SELECT auth.uid())
        AND org_members.role = 'org_admin'
    )
  );

CREATE POLICY "sms_reminders_service_all" ON public.org_sms_reminders
  FOR ALL USING ((SELECT auth.role()) = 'service_role');


-- ============================================================================
-- public.game_sms_reminder_logs  (033_multi_sms_reminders)
-- ============================================================================

DROP POLICY IF EXISTS "sms_reminder_logs_service_all" ON public.game_sms_reminder_logs;

CREATE POLICY "sms_reminder_logs_service_all" ON public.game_sms_reminder_logs
  FOR ALL USING ((SELECT auth.role()) = 'service_role');


-- ============================================================================
-- public.stat_definitions  (035_player_stats)
-- ============================================================================

DROP POLICY IF EXISTS "stat_defs_org_admin_write" ON public.stat_definitions;
DROP POLICY IF EXISTS "stat_defs_service"          ON public.stat_definitions;

CREATE POLICY "stat_defs_org_admin_write" ON public.stat_definitions
  FOR ALL USING (
    organization_id IS NOT NULL
    AND organization_id = (
      SELECT current_setting('app.current_org_id', true)::uuid
    )
    AND EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.organization_id = stat_definitions.organization_id
        AND org_members.user_id = (SELECT auth.uid())
        AND org_members.role IN ('org_admin', 'league_admin')
        AND org_members.status = 'active'
    )
  );

CREATE POLICY "stat_defs_service" ON public.stat_definitions
  FOR ALL USING ((SELECT auth.role()) = 'service_role');


-- ============================================================================
-- public.player_game_stats  (035_player_stats)
-- ============================================================================

DROP POLICY IF EXISTS "player_stats_read"              ON public.player_game_stats;
DROP POLICY IF EXISTS "player_stats_admin_write"       ON public.player_game_stats;
DROP POLICY IF EXISTS "player_stats_captain_write"     ON public.player_game_stats;
DROP POLICY IF EXISTS "player_stats_captain_update"    ON public.player_game_stats;
DROP POLICY IF EXISTS "player_stats_organizer_write"   ON public.player_game_stats;
DROP POLICY IF EXISTS "player_stats_service"           ON public.player_game_stats;

CREATE POLICY "player_stats_read" ON public.player_game_stats
  FOR SELECT USING (
    organization_id = (
      SELECT current_setting('app.current_org_id', true)::uuid
    )
    AND (
      (SELECT auth.uid()) IS NOT NULL
      OR EXISTS (
        SELECT 1 FROM public.leagues
        WHERE leagues.id = player_game_stats.league_id
          AND leagues.stats_public = true
      )
    )
  );

CREATE POLICY "player_stats_admin_write" ON public.player_game_stats
  FOR ALL USING (
    organization_id = (
      SELECT current_setting('app.current_org_id', true)::uuid
    )
    AND EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.organization_id = player_game_stats.organization_id
        AND org_members.user_id = (SELECT auth.uid())
        AND org_members.role IN ('org_admin', 'league_admin')
        AND org_members.status = 'active'
    )
  );

CREATE POLICY "player_stats_captain_write" ON public.player_game_stats
  FOR INSERT WITH CHECK (
    organization_id = (
      SELECT current_setting('app.current_org_id', true)::uuid
    )
    AND EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = player_game_stats.team_id
        AND team_members.user_id = (SELECT auth.uid())
        AND team_members.role = 'captain'
    )
  );

CREATE POLICY "player_stats_captain_update" ON public.player_game_stats
  FOR UPDATE USING (
    organization_id = (
      SELECT current_setting('app.current_org_id', true)::uuid
    )
    AND EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = player_game_stats.team_id
        AND team_members.user_id = (SELECT auth.uid())
        AND team_members.role = 'captain'
    )
  );

CREATE POLICY "player_stats_organizer_write" ON public.player_game_stats
  FOR ALL USING (
    organization_id = (
      SELECT current_setting('app.current_org_id', true)::uuid
    )
    AND EXISTS (
      SELECT 1 FROM public.league_organizers
      WHERE league_organizers.league_id = player_game_stats.league_id
        AND league_organizers.user_id = (SELECT auth.uid())
        AND league_organizers.status = 'active'
    )
  );

CREATE POLICY "player_stats_service" ON public.player_game_stats
  FOR ALL USING ((SELECT auth.role()) = 'service_role');


-- ============================================================================
-- public.game_rsvps  (040_game_rsvps)
-- ============================================================================

DROP POLICY IF EXISTS "game_rsvps_read"        ON public.game_rsvps;
DROP POLICY IF EXISTS "game_rsvps_own_insert"  ON public.game_rsvps;
DROP POLICY IF EXISTS "game_rsvps_own_update"  ON public.game_rsvps;
DROP POLICY IF EXISTS "game_rsvps_own_delete"  ON public.game_rsvps;
DROP POLICY IF EXISTS "game_rsvps_service_all" ON public.game_rsvps;

CREATE POLICY "game_rsvps_read" ON public.game_rsvps
  FOR SELECT USING ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY "game_rsvps_own_insert" ON public.game_rsvps
  FOR INSERT WITH CHECK (user_id = (SELECT auth.uid())::uuid);

CREATE POLICY "game_rsvps_own_update" ON public.game_rsvps
  FOR UPDATE USING (user_id = (SELECT auth.uid())::uuid);

CREATE POLICY "game_rsvps_own_delete" ON public.game_rsvps
  FOR DELETE USING (user_id = (SELECT auth.uid())::uuid);

CREATE POLICY "game_rsvps_service_all" ON public.game_rsvps
  FOR ALL USING ((SELECT auth.role()) = 'service_role');


-- ============================================================================
-- public.player_game_day_sms_logs  (046_game_day_sms)
-- ============================================================================

DROP POLICY IF EXISTS "own_game_day_logs" ON public.player_game_day_sms_logs;

CREATE POLICY "own_game_day_logs" ON public.player_game_day_sms_logs
  FOR SELECT USING ((SELECT auth.uid()) = user_id);


-- ============================================================================
-- public.org_site_content  (047_site_themes)
-- ============================================================================

DROP POLICY IF EXISTS "org_site_content_admin" ON public.org_site_content;

CREATE POLICY "org_site_content_admin" ON public.org_site_content
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.organization_id = org_site_content.organization_id
        AND org_members.user_id = (SELECT auth.uid())
        AND org_members.role IN ('org_admin', 'league_admin')
    )
  );


-- ============================================================================
-- public.org_photos  (048_org_photos)
-- ============================================================================

DROP POLICY IF EXISTS "org_photos_admin" ON public.org_photos;

CREATE POLICY "org_photos_admin" ON public.org_photos
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.organization_id = org_photos.organization_id
        AND org_members.user_id = (SELECT auth.uid())
        AND org_members.role IN ('org_admin', 'league_admin')
    )
  );


-- ============================================================================
-- public.org_sponsors  (049_sponsors_staff)
-- ============================================================================

DROP POLICY IF EXISTS "org_sponsors_admin" ON public.org_sponsors;

CREATE POLICY "org_sponsors_admin" ON public.org_sponsors
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.organization_id = org_sponsors.organization_id
        AND org_members.user_id = (SELECT auth.uid())
        AND org_members.role IN ('org_admin', 'league_admin')
    )
  );


-- ============================================================================
-- public.org_staff  (049_sponsors_staff)
-- ============================================================================

DROP POLICY IF EXISTS "org_staff_admin" ON public.org_staff;

CREATE POLICY "org_staff_admin" ON public.org_staff
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.organization_id = org_staff.organization_id
        AND org_members.user_id = (SELECT auth.uid())
        AND org_members.role IN ('org_admin', 'league_admin')
    )
  );


-- ============================================================================
-- public.merchandise_items  (056_merchandise + 060_standalone_merch_shop)
-- ============================================================================

DROP POLICY IF EXISTS "org_admin_merchandise_items"      ON public.merchandise_items;
DROP POLICY IF EXISTS "player_read_merchandise_items"    ON public.merchandise_items;
DROP POLICY IF EXISTS "org_member_read_shop_merchandise" ON public.merchandise_items;

CREATE POLICY "org_admin_merchandise_items" ON public.merchandise_items
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.organization_id = merchandise_items.organization_id
        AND om.user_id = (SELECT auth.uid())
        AND om.role IN ('org_admin', 'league_admin')
        AND om.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.organization_id = merchandise_items.organization_id
        AND om.user_id = (SELECT auth.uid())
        AND om.role IN ('org_admin', 'league_admin')
        AND om.status = 'active'
    )
  );

CREATE POLICY "player_read_merchandise_items" ON public.merchandise_items
  FOR SELECT TO authenticated
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1 FROM public.league_merchandise lm
        JOIN public.registrations r ON r.league_id = lm.league_id
      WHERE lm.item_id = merchandise_items.id
        AND r.user_id = (SELECT auth.uid())
        AND r.organization_id = merchandise_items.organization_id
    )
  );

CREATE POLICY "org_member_read_shop_merchandise" ON public.merchandise_items
  FOR SELECT
  USING (
    shop_enabled = true
    AND EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.organization_id = merchandise_items.organization_id
        AND om.user_id = (SELECT auth.uid())
    )
  );


-- ============================================================================
-- public.merchandise_variants  (056_merchandise)
-- ============================================================================

DROP POLICY IF EXISTS "org_admin_merchandise_variants"   ON public.merchandise_variants;
DROP POLICY IF EXISTS "player_read_merchandise_variants" ON public.merchandise_variants;

CREATE POLICY "org_admin_merchandise_variants" ON public.merchandise_variants
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.merchandise_items mi
        JOIN public.org_members om ON om.organization_id = mi.organization_id
      WHERE mi.id = merchandise_variants.item_id
        AND om.user_id = (SELECT auth.uid())
        AND om.role IN ('org_admin', 'league_admin')
        AND om.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.merchandise_items mi
        JOIN public.org_members om ON om.organization_id = mi.organization_id
      WHERE mi.id = merchandise_variants.item_id
        AND om.user_id = (SELECT auth.uid())
        AND om.role IN ('org_admin', 'league_admin')
        AND om.status = 'active'
    )
  );

CREATE POLICY "player_read_merchandise_variants" ON public.merchandise_variants
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.merchandise_items mi
        JOIN public.league_merchandise lm ON lm.item_id = mi.id
        JOIN public.registrations r ON r.league_id = lm.league_id
      WHERE mi.id = merchandise_variants.item_id
        AND r.user_id = (SELECT auth.uid())
        AND mi.is_active = true
    )
  );


-- ============================================================================
-- public.league_merchandise  (056_merchandise)
-- ============================================================================

DROP POLICY IF EXISTS "org_admin_league_merchandise"   ON public.league_merchandise;
DROP POLICY IF EXISTS "player_read_league_merchandise" ON public.league_merchandise;

CREATE POLICY "org_admin_league_merchandise" ON public.league_merchandise
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.leagues l
        JOIN public.org_members om ON om.organization_id = l.organization_id
      WHERE l.id = league_merchandise.league_id
        AND om.user_id = (SELECT auth.uid())
        AND om.role IN ('org_admin', 'league_admin')
        AND om.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.leagues l
        JOIN public.org_members om ON om.organization_id = l.organization_id
      WHERE l.id = league_merchandise.league_id
        AND om.user_id = (SELECT auth.uid())
        AND om.role IN ('org_admin', 'league_admin')
        AND om.status = 'active'
    )
  );

CREATE POLICY "player_read_league_merchandise" ON public.league_merchandise
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.registrations r
      WHERE r.league_id = league_merchandise.league_id
        AND r.user_id = (SELECT auth.uid())
    )
  );


-- ============================================================================
-- public.merchandise_orders  (056_merchandise)
-- ============================================================================

DROP POLICY IF EXISTS "org_admin_merchandise_orders"       ON public.merchandise_orders;
DROP POLICY IF EXISTS "player_read_own_merchandise_orders" ON public.merchandise_orders;

CREATE POLICY "org_admin_merchandise_orders" ON public.merchandise_orders
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.organization_id = merchandise_orders.organization_id
        AND om.user_id = (SELECT auth.uid())
        AND om.role IN ('org_admin', 'league_admin')
        AND om.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.organization_id = merchandise_orders.organization_id
        AND om.user_id = (SELECT auth.uid())
        AND om.role IN ('org_admin', 'league_admin')
        AND om.status = 'active'
    )
  );

CREATE POLICY "player_read_own_merchandise_orders" ON public.merchandise_orders
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));


-- ============================================================================
-- storage.objects – merchandise-images bucket  (057_merchandise_phase2)
-- ============================================================================

DROP POLICY IF EXISTS "merchandise_images_admin_insert" ON storage.objects;
DROP POLICY IF EXISTS "merchandise_images_admin_update" ON storage.objects;
DROP POLICY IF EXISTS "merchandise_images_admin_delete" ON storage.objects;

CREATE POLICY "merchandise_images_admin_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'merchandise-images'
    AND EXISTS (
      SELECT 1 FROM public.org_members
      WHERE user_id = (SELECT auth.uid())
        AND role IN ('org_admin', 'league_admin')
        AND status = 'active'
    )
  );

CREATE POLICY "merchandise_images_admin_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'merchandise-images'
    AND EXISTS (
      SELECT 1 FROM public.org_members
      WHERE user_id = (SELECT auth.uid())
        AND role IN ('org_admin', 'league_admin')
        AND status = 'active'
    )
  );

CREATE POLICY "merchandise_images_admin_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'merchandise-images'
    AND EXISTS (
      SELECT 1 FROM public.org_members
      WHERE user_id = (SELECT auth.uid())
        AND role IN ('org_admin', 'league_admin')
        AND status = 'active'
    )
  );


-- ============================================================================
-- public.cart_items  (062_cart_items)
-- ============================================================================

DROP POLICY IF EXISTS "users_manage_own_cart" ON public.cart_items;

CREATE POLICY "users_manage_own_cart" ON public.cart_items
  FOR ALL
  USING  (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));


-- ============================================================================
-- public.playoff_configs  (075_playoff_tiers)
-- ============================================================================

DROP POLICY IF EXISTS "org_admin_all_playoff_configs" ON public.playoff_configs;

CREATE POLICY "org_admin_all_playoff_configs" ON public.playoff_configs
  FOR ALL USING (
    organization_id = current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.organization_id = playoff_configs.organization_id
        AND om.user_id = (SELECT auth.uid())
        AND om.role IN ('org_admin', 'league_admin')
    )
  );


-- ============================================================================
-- public.playoff_tiers  (075_playoff_tiers)
-- ============================================================================

DROP POLICY IF EXISTS "org_admin_all_playoff_tiers" ON public.playoff_tiers;

CREATE POLICY "org_admin_all_playoff_tiers" ON public.playoff_tiers
  FOR ALL USING (
    organization_id = current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.organization_id = playoff_tiers.organization_id
        AND om.user_id = (SELECT auth.uid())
        AND om.role IN ('org_admin', 'league_admin')
    )
  );


-- ============================================================================
-- public.roster_notes  (080_roster_notes)
-- ============================================================================

DROP POLICY IF EXISTS "admins_manage_roster_notes"   ON public.roster_notes;
DROP POLICY IF EXISTS "captains_manage_roster_notes" ON public.roster_notes;

CREATE POLICY "admins_manage_roster_notes" ON public.roster_notes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.organization_id = roster_notes.organization_id
        AND om.user_id = (SELECT auth.uid())
        AND om.role IN ('org_admin', 'league_admin')
        AND om.status = 'active'
    )
  );

CREATE POLICY "captains_manage_roster_notes" ON public.roster_notes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = roster_notes.team_id
        AND tm.user_id = (SELECT auth.uid())
        AND tm.role IN ('captain', 'coach')
        AND tm.status = 'active'
    )
  );


-- ============================================================================
-- storage.objects – org-documents bucket  (084_org_documents_bucket)
-- ============================================================================

DROP POLICY IF EXISTS "org_documents_service_role_all" ON storage.objects;

CREATE POLICY "org_documents_service_role_all" ON storage.objects
  FOR ALL
  USING  (bucket_id = 'org-documents' AND (SELECT auth.role()) = 'service_role')
  WITH CHECK (bucket_id = 'org-documents' AND (SELECT auth.role()) = 'service_role');


-- ============================================================================
-- public.league_documents  (086_league_documents)
-- ============================================================================

DROP POLICY IF EXISTS "org_admin_manage_league_documents" ON public.league_documents;

CREATE POLICY "org_admin_manage_league_documents" ON public.league_documents
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.organization_id = league_documents.organization_id
        AND om.user_id = (SELECT auth.uid())
        AND om.role IN ('org_admin', 'league_admin')
        AND om.status = 'active'
    )
  );
