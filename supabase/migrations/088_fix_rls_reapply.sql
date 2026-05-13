-- ============================================================================
-- Migration 088: Re-apply all RLS policy fixes from 087 inside a transaction
--
-- Migration 087 ran without an explicit transaction.  If the league_documents
-- table did not yet exist in the target database, the final DROP POLICY
-- statement would error, but every prior statement would already have
-- committed — leaving some policies DROPPED but never RECREATED.
--
-- This migration wraps the entire set of DROP + CREATE statements in a
-- single transaction so it is all-or-nothing.  It also guards the
-- league_documents section with a conditional block so the migration
-- succeeds even if migration 086 has not been applied yet.
-- ============================================================================

BEGIN;

-- ── public.profiles ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "profiles_self_read"   ON public.profiles;
DROP POLICY IF EXISTS "profiles_self_update" ON public.profiles;
DROP POLICY IF EXISTS "profiles_service_all" ON public.profiles;

CREATE POLICY "profiles_self_read" ON public.profiles
  FOR SELECT USING (id = (SELECT auth.uid()));

CREATE POLICY "profiles_self_update" ON public.profiles
  FOR UPDATE USING (id = (SELECT auth.uid()));

CREATE POLICY "profiles_service_all" ON public.profiles
  FOR ALL USING ((SELECT auth.role()) = 'service_role');


-- ── public.organizations ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "orgs_service_all" ON public.organizations;

CREATE POLICY "orgs_service_all" ON public.organizations
  FOR ALL USING ((SELECT auth.role()) = 'service_role');


-- ── public.org_members ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "org_members_admin_all"   ON public.org_members;
DROP POLICY IF EXISTS "org_members_service_all" ON public.org_members;

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


-- ── public.org_branding ───────────────────────────────────────────────────────
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


-- ── public.subscriptions ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "subscriptions_service_all" ON public.subscriptions;

CREATE POLICY "subscriptions_service_all" ON public.subscriptions
  FOR ALL USING ((SELECT auth.role()) = 'service_role');


-- ── public.leagues ────────────────────────────────────────────────────────────
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


-- ── public.divisions ─────────────────────────────────────────────────────────
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


-- ── public.teams ──────────────────────────────────────────────────────────────
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


-- ── public.team_members ───────────────────────────────────────────────────────
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


-- ── public.waivers ────────────────────────────────────────────────────────────
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


-- ── public.waiver_signatures ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "waiver_signatures_own"         ON public.waiver_signatures;
DROP POLICY IF EXISTS "waiver_signatures_insert"      ON public.waiver_signatures;
DROP POLICY IF EXISTS "waiver_signatures_admin_read"  ON public.waiver_signatures;
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


-- ── public.registrations ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "registrations_own"         ON public.registrations;
DROP POLICY IF EXISTS "registrations_insert"      ON public.registrations;
DROP POLICY IF EXISTS "registrations_admin_all"   ON public.registrations;
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


-- ── public.player_details ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "player_details_own"         ON public.player_details;
DROP POLICY IF EXISTS "player_details_admin_read"  ON public.player_details;
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


-- ── public.payments ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "payments_own"         ON public.payments;
DROP POLICY IF EXISTS "payments_admin_all"   ON public.payments;
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


-- ── public.games ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "games_admin_write" ON public.games;
DROP POLICY IF EXISTS "games_service_all" ON public.games;

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


-- ── public.game_results ───────────────────────────────────────────────────────
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


-- ── public.announcements ─────────────────────────────────────────────────────
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


-- ── public.notifications ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "notifications_own"         ON public.notifications;
DROP POLICY IF EXISTS "notifications_service_all" ON public.notifications;

CREATE POLICY "notifications_own" ON public.notifications
  FOR ALL USING (
    organization_id = current_org_id()
    AND user_id = (SELECT auth.uid())
  );

CREATE POLICY "notifications_service_all" ON public.notifications
  FOR ALL USING ((SELECT auth.role()) = 'service_role');


-- ── public.team_join_requests  (004_apply_pending_changes) ───────────────────
DROP POLICY IF EXISTS "join_requests_self_read"   ON public.team_join_requests;
DROP POLICY IF EXISTS "join_requests_self_insert" ON public.team_join_requests;
DROP POLICY IF EXISTS "join_requests_service_all" ON public.team_join_requests;

CREATE POLICY "join_requests_self_read" ON public.team_join_requests
  FOR SELECT USING (user_id = (SELECT auth.uid()));

CREATE POLICY "join_requests_self_insert" ON public.team_join_requests
  FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "join_requests_service_all" ON public.team_join_requests
  FOR ALL USING ((SELECT auth.role()) = 'service_role');


-- ── public.league_rule_templates  (005_league_rules) ─────────────────────────
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


-- ── storage.objects – team-logos  (006_team_logos_bucket) ────────────────────
DROP POLICY IF EXISTS "team_logos_service_write"  ON storage.objects;
DROP POLICY IF EXISTS "team_logos_service_update" ON storage.objects;
DROP POLICY IF EXISTS "team_logos_service_delete" ON storage.objects;

CREATE POLICY "team_logos_service_write" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'team-logos' AND (SELECT auth.role()) = 'service_role');

CREATE POLICY "team_logos_service_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'team-logos' AND (SELECT auth.role()) = 'service_role');

CREATE POLICY "team_logos_service_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'team-logos' AND (SELECT auth.role()) = 'service_role');


-- ── public.drop_in_registrations  (009_phase2) ───────────────────────────────
DROP POLICY IF EXISTS "drop_in_reg_self_read" ON public.drop_in_registrations;
DROP POLICY IF EXISTS "drop_in_reg_service"   ON public.drop_in_registrations;

CREATE POLICY "drop_in_reg_self_read" ON public.drop_in_registrations
  FOR SELECT USING (user_id = (SELECT auth.uid()));

CREATE POLICY "drop_in_reg_service" ON public.drop_in_registrations
  FOR ALL USING ((SELECT auth.role()) = 'service_role');


-- ── public.discount_codes  (009_phase2) ──────────────────────────────────────
DROP POLICY IF EXISTS "discount_codes_service" ON public.discount_codes;

CREATE POLICY "discount_codes_service" ON public.discount_codes
  FOR ALL USING ((SELECT auth.role()) = 'service_role');


-- ── public.payment_plans  (009_phase2) ───────────────────────────────────────
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


-- ── public.payment_plan_enrollments  (009_phase2) ────────────────────────────
DROP POLICY IF EXISTS "enrollment_service" ON public.payment_plan_enrollments;

CREATE POLICY "enrollment_service" ON public.payment_plan_enrollments
  FOR ALL USING ((SELECT auth.role()) = 'service_role');


-- ── public.payment_plan_installments  (009_phase2) ───────────────────────────
DROP POLICY IF EXISTS "installments_service" ON public.payment_plan_installments;

CREATE POLICY "installments_service" ON public.payment_plan_installments
  FOR ALL USING ((SELECT auth.role()) = 'service_role');


-- ── storage.objects – org-branding  (011_org_branding_bucket) ────────────────
DROP POLICY IF EXISTS "org_branding_service_insert" ON storage.objects;
DROP POLICY IF EXISTS "org_branding_service_update" ON storage.objects;
DROP POLICY IF EXISTS "org_branding_service_delete" ON storage.objects;

CREATE POLICY "org_branding_service_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'org-branding' AND (SELECT auth.role()) = 'service_role');

CREATE POLICY "org_branding_service_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'org-branding' AND (SELECT auth.role()) = 'service_role');

CREATE POLICY "org_branding_service_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'org-branding' AND (SELECT auth.role()) = 'service_role');


-- ── public.stripe_accounts  (012_stripe_connect_rls) ─────────────────────────
DROP POLICY IF EXISTS "stripe_accounts_org_admin_read"   ON public.stripe_accounts;
DROP POLICY IF EXISTS "stripe_accounts_org_admin_insert" ON public.stripe_accounts;
DROP POLICY IF EXISTS "stripe_accounts_org_admin_update" ON public.stripe_accounts;
DROP POLICY IF EXISTS "stripe_accounts_service_all"      ON public.stripe_accounts;

CREATE POLICY "stripe_accounts_org_admin_read" ON public.stripe_accounts
  FOR SELECT USING (
    organization_id = current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.organization_id = current_org_id()
        AND org_members.user_id = (SELECT auth.uid())
        AND org_members.role = 'org_admin'
    )
  );

CREATE POLICY "stripe_accounts_org_admin_insert" ON public.stripe_accounts
  FOR INSERT WITH CHECK (
    organization_id = current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.organization_id = current_org_id()
        AND org_members.user_id = (SELECT auth.uid())
        AND org_members.role = 'org_admin'
    )
  );

CREATE POLICY "stripe_accounts_org_admin_update" ON public.stripe_accounts
  FOR UPDATE USING (
    organization_id = current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.organization_id = current_org_id()
        AND org_members.user_id = (SELECT auth.uid())
        AND org_members.role = 'org_admin'
    )
  );

CREATE POLICY "stripe_accounts_service_all" ON public.stripe_accounts
  FOR ALL USING ((SELECT auth.role()) = 'service_role');


-- ── public.sport_positions  (013_sport_positions) ────────────────────────────
DROP POLICY IF EXISTS "positions_admin_write" ON public.sport_positions;
DROP POLICY IF EXISTS "positions_service_all" ON public.sport_positions;

CREATE POLICY "positions_admin_write" ON public.sport_positions
  FOR ALL USING (
    organization_id = current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.organization_id = current_org_id()
        AND org_members.user_id = (SELECT auth.uid())
        AND org_members.role IN ('org_admin', 'league_admin')
    )
  );

CREATE POLICY "positions_service_all" ON public.sport_positions
  FOR ALL USING ((SELECT auth.role()) = 'service_role');


-- ── public.event_sessions / session_registrations  (015_sessions) ────────────
DROP POLICY IF EXISTS "sessions_admin_write"    ON public.event_sessions;
DROP POLICY IF EXISTS "sessions_service_all"    ON public.event_sessions;
DROP POLICY IF EXISTS "session_reg_insert"      ON public.session_registrations;
DROP POLICY IF EXISTS "session_reg_self_update" ON public.session_registrations;
DROP POLICY IF EXISTS "session_reg_admin"       ON public.session_registrations;

CREATE POLICY "sessions_admin_write" ON public.event_sessions
  FOR ALL USING (
    organization_id = current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.organization_id = current_org_id()
        AND om.user_id = (SELECT auth.uid())
        AND om.role IN ('org_admin', 'league_admin')
    )
  );

CREATE POLICY "sessions_service_all" ON public.event_sessions
  FOR ALL USING ((SELECT auth.role()) = 'service_role');

CREATE POLICY "session_reg_insert" ON public.session_registrations
  FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "session_reg_self_update" ON public.session_registrations
  FOR UPDATE USING (user_id = (SELECT auth.uid()));

CREATE POLICY "session_reg_admin" ON public.session_registrations
  FOR ALL USING (
    organization_id = current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.organization_id = current_org_id()
        AND om.user_id = (SELECT auth.uid())
        AND om.role IN ('org_admin', 'league_admin')
    )
  );


-- ── public.pools  (016_pools) ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "pools_admin_write" ON public.pools;
DROP POLICY IF EXISTS "pools_service_all" ON public.pools;

CREATE POLICY "pools_admin_write" ON public.pools
  FOR ALL USING (
    organization_id = current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.organization_id = current_org_id()
        AND om.user_id = (SELECT auth.uid())
        AND om.role IN ('org_admin', 'league_admin')
    )
  );

CREATE POLICY "pools_service_all" ON public.pools
  FOR ALL USING ((SELECT auth.role()) = 'service_role');


-- ── public.pickup_invites  (022_pickup_invites) ───────────────────────────────
DROP POLICY IF EXISTS "pickup_invites_admin_insert" ON public.pickup_invites;
DROP POLICY IF EXISTS "pickup_invites_invitee_read" ON public.pickup_invites;

CREATE POLICY "pickup_invites_admin_insert" ON public.pickup_invites
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE user_id = (SELECT auth.uid())
        AND role IN ('org_admin', 'league_admin')
    )
  );

CREATE POLICY "pickup_invites_invitee_read" ON public.pickup_invites
  FOR SELECT USING (
    email = (SELECT email FROM auth.users WHERE id = (SELECT auth.uid()))
  );


-- ── public.league_organizers  (028_league_organizers) ────────────────────────
DROP POLICY IF EXISTS "league_organizers_admin_manage" ON public.league_organizers;
DROP POLICY IF EXISTS "league_organizers_self_read"    ON public.league_organizers;
DROP POLICY IF EXISTS "league_organizers_public_read"  ON public.league_organizers;

CREATE POLICY "league_organizers_admin_manage" ON public.league_organizers
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.organization_id = league_organizers.organization_id
        AND org_members.user_id = (SELECT auth.uid())
        AND org_members.role IN ('org_admin', 'league_admin')
    )
  );

CREATE POLICY "league_organizers_self_read" ON public.league_organizers
  FOR SELECT USING (user_id = (SELECT auth.uid()));

CREATE POLICY "league_organizers_public_read" ON public.league_organizers
  FOR SELECT USING (true);


-- ── storage.objects – player-avatars  (036_player_avatars_bucket) ─────────────
DROP POLICY IF EXISTS "player_avatars_owner_insert" ON storage.objects;
DROP POLICY IF EXISTS "player_avatars_owner_update" ON storage.objects;
DROP POLICY IF EXISTS "player_avatars_owner_delete" ON storage.objects;
DROP POLICY IF EXISTS "player_avatars_owner_write"  ON storage.objects;  -- old name, may not exist

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


-- ── public.org_notification_settings  (032_org_notification_settings) ─────────
DROP POLICY IF EXISTS "notif_settings_admin_all" ON public.org_notification_settings;
DROP POLICY IF EXISTS "notif_settings_service"   ON public.org_notification_settings;

CREATE POLICY "notif_settings_admin_all" ON public.org_notification_settings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.organization_id = org_notification_settings.organization_id
        AND org_members.user_id = (SELECT auth.uid())
        AND org_members.role IN ('org_admin', 'league_admin')
    )
  );

CREATE POLICY "notif_settings_service" ON public.org_notification_settings
  FOR ALL USING ((SELECT auth.role()) = 'service_role');


-- ── public.org_sms_reminders  (033_multi_sms_reminders) ──────────────────────
DROP POLICY IF EXISTS "sms_reminders_admin_read" ON public.org_sms_reminders;
DROP POLICY IF EXISTS "sms_reminders_service"    ON public.org_sms_reminders;

CREATE POLICY "sms_reminders_admin_read" ON public.org_sms_reminders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.organization_id = org_sms_reminders.organization_id
        AND org_members.user_id = (SELECT auth.uid())
        AND org_members.role IN ('org_admin', 'league_admin')
    )
  );

CREATE POLICY "sms_reminders_service" ON public.org_sms_reminders
  FOR ALL USING ((SELECT auth.role()) = 'service_role');


-- ── public.game_sms_reminder_logs  (033_multi_sms_reminders) ─────────────────
DROP POLICY IF EXISTS "sms_logs_service" ON public.game_sms_reminder_logs;

CREATE POLICY "sms_logs_service" ON public.game_sms_reminder_logs
  FOR ALL USING ((SELECT auth.role()) = 'service_role');


-- ── public.stat_definitions / player_game_stats  (035_player_stats) ──────────
DROP POLICY IF EXISTS "stat_defs_admin_write" ON public.stat_definitions;
DROP POLICY IF EXISTS "stat_defs_service_all" ON public.stat_definitions;
DROP POLICY IF EXISTS "player_stats_member_insert" ON public.player_game_stats;
DROP POLICY IF EXISTS "player_stats_admin_all"     ON public.player_game_stats;

CREATE POLICY "stat_defs_admin_write" ON public.stat_definitions
  FOR ALL USING (
    organization_id = current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.organization_id = current_org_id()
        AND org_members.user_id = (SELECT auth.uid())
        AND org_members.role IN ('org_admin', 'league_admin')
    )
  );

CREATE POLICY "stat_defs_service_all" ON public.stat_definitions
  FOR ALL USING ((SELECT auth.role()) = 'service_role');

CREATE POLICY "player_stats_member_insert" ON public.player_game_stats
  FOR INSERT WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.organization_id = player_game_stats.organization_id
        AND org_members.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "player_stats_admin_all" ON public.player_game_stats
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.organization_id = player_game_stats.organization_id
        AND org_members.user_id = (SELECT auth.uid())
        AND org_members.role IN ('org_admin', 'league_admin')
    )
  );


-- ── public.game_rsvps  (040_game_rsvps) ──────────────────────────────────────
DROP POLICY IF EXISTS "rsvp_authenticated_read" ON public.game_rsvps;
DROP POLICY IF EXISTS "rsvp_self_insert"        ON public.game_rsvps;
DROP POLICY IF EXISTS "rsvp_self_update"        ON public.game_rsvps;
DROP POLICY IF EXISTS "rsvp_self_delete"        ON public.game_rsvps;
DROP POLICY IF EXISTS "rsvp_service_all"        ON public.game_rsvps;

CREATE POLICY "rsvp_authenticated_read" ON public.game_rsvps
  FOR SELECT USING ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY "rsvp_self_insert" ON public.game_rsvps
  FOR INSERT WITH CHECK (user_id = (SELECT auth.uid())::uuid);

CREATE POLICY "rsvp_self_update" ON public.game_rsvps
  FOR UPDATE USING (user_id = (SELECT auth.uid())::uuid);

CREATE POLICY "rsvp_self_delete" ON public.game_rsvps
  FOR DELETE USING (user_id = (SELECT auth.uid())::uuid);

CREATE POLICY "rsvp_service_all" ON public.game_rsvps
  FOR ALL USING ((SELECT auth.role()) = 'service_role');


-- ── public.player_game_day_sms_logs  (046_game_day_sms) ──────────────────────
DROP POLICY IF EXISTS "game_day_sms_self_read" ON public.player_game_day_sms_logs;

CREATE POLICY "game_day_sms_self_read" ON public.player_game_day_sms_logs
  FOR SELECT USING ((SELECT auth.uid()) = user_id);


-- ── public.org_site_content  (047_site_themes) ───────────────────────────────
DROP POLICY IF EXISTS "site_content_admin_all" ON public.org_site_content;

CREATE POLICY "site_content_admin_all" ON public.org_site_content
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.organization_id = org_site_content.organization_id
        AND org_members.user_id = (SELECT auth.uid())
        AND org_members.role IN ('org_admin', 'league_admin')
    )
  );


-- ── public.org_photos  (048_org_photos) ──────────────────────────────────────
DROP POLICY IF EXISTS "org_photos_admin_manage" ON public.org_photos;

CREATE POLICY "org_photos_admin_manage" ON public.org_photos
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.organization_id = org_photos.organization_id
        AND org_members.user_id = (SELECT auth.uid())
        AND org_members.role IN ('org_admin', 'league_admin')
    )
  );


-- ── public.org_sponsors / org_staff  (049_sponsors_staff) ────────────────────
DROP POLICY IF EXISTS "sponsors_admin_manage" ON public.org_sponsors;
DROP POLICY IF EXISTS "staff_admin_manage"    ON public.org_staff;

CREATE POLICY "sponsors_admin_manage" ON public.org_sponsors
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.organization_id = org_sponsors.organization_id
        AND org_members.user_id = (SELECT auth.uid())
        AND org_members.role IN ('org_admin', 'league_admin')
    )
  );

CREATE POLICY "staff_admin_manage" ON public.org_staff
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.organization_id = org_staff.organization_id
        AND org_members.user_id = (SELECT auth.uid())
        AND org_members.role IN ('org_admin', 'league_admin')
    )
  );


-- ── public.merchandise_items / variants / orders  (056 + 060) ────────────────
DROP POLICY IF EXISTS "merch_items_admin_manage"       ON public.merchandise_items;
DROP POLICY IF EXISTS "merch_items_participant_read"   ON public.merchandise_items;
DROP POLICY IF EXISTS "org_member_read_shop_merchandise" ON public.merchandise_items;
DROP POLICY IF EXISTS "merch_variants_admin_manage"    ON public.merchandise_variants;
DROP POLICY IF EXISTS "merch_variants_participant_read" ON public.merchandise_variants;
DROP POLICY IF EXISTS "merch_orders_admin_manage"      ON public.merchandise_orders;
DROP POLICY IF EXISTS "merch_orders_self_read"         ON public.merchandise_orders;
DROP POLICY IF EXISTS "merch_orders_service_all"       ON public.merchandise_orders;

CREATE POLICY "merch_items_admin_manage" ON public.merchandise_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.organization_id = merchandise_items.organization_id
        AND om.user_id = (SELECT auth.uid())
        AND om.role IN ('org_admin', 'league_admin')
    )
  );

CREATE POLICY "merch_items_participant_read" ON public.merchandise_items
  FOR SELECT USING (
    is_active = true
    AND EXISTS (
      SELECT 1 FROM public.registrations r
      WHERE r.organization_id = merchandise_items.organization_id
        AND r.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "org_member_read_shop_merchandise" ON public.merchandise_items
  FOR SELECT USING (
    shop_enabled = true
    AND EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.organization_id = merchandise_items.organization_id
        AND om.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "merch_variants_admin_manage" ON public.merchandise_variants
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.organization_id = merchandise_variants.organization_id
        AND om.user_id = (SELECT auth.uid())
        AND om.role IN ('org_admin', 'league_admin')
    )
  );

CREATE POLICY "merch_variants_participant_read" ON public.merchandise_variants
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.registrations r
      WHERE r.organization_id = merchandise_variants.organization_id
        AND r.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "merch_orders_admin_manage" ON public.merchandise_orders
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.organization_id = merchandise_orders.organization_id
        AND om.user_id = (SELECT auth.uid())
        AND om.role IN ('org_admin', 'league_admin')
    )
  );

CREATE POLICY "merch_orders_self_read" ON public.merchandise_orders
  FOR SELECT USING (user_id = (SELECT auth.uid()));

CREATE POLICY "merch_orders_service_all" ON public.merchandise_orders
  FOR ALL USING ((SELECT auth.role()) = 'service_role');


-- ── storage.objects – merchandise-images  (057_merchandise_phase2) ────────────
DROP POLICY IF EXISTS "merchandise_images_admin_insert" ON storage.objects;
DROP POLICY IF EXISTS "merchandise_images_admin_update" ON storage.objects;
DROP POLICY IF EXISTS "merchandise_images_admin_delete" ON storage.objects;

CREATE POLICY "merchandise_images_admin_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'merchandise-images'
    AND EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.user_id = (SELECT auth.uid())
        AND om.role IN ('org_admin', 'league_admin')
    )
  );

CREATE POLICY "merchandise_images_admin_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'merchandise-images'
    AND EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.user_id = (SELECT auth.uid())
        AND om.role IN ('org_admin', 'league_admin')
    )
  );

CREATE POLICY "merchandise_images_admin_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'merchandise-images'
    AND EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.user_id = (SELECT auth.uid())
        AND om.role IN ('org_admin', 'league_admin')
    )
  );


-- ── public.cart_items  (062_cart_items) ───────────────────────────────────────
DROP POLICY IF EXISTS "cart_items_owner_all" ON public.cart_items;

CREATE POLICY "cart_items_owner_all" ON public.cart_items
  FOR ALL
  USING  (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));


-- ── public.playoff_configs / playoff_tiers  (075_playoff_tiers) ──────────────
DROP POLICY IF EXISTS "org_admin_all_playoff_configs" ON public.playoff_configs;
DROP POLICY IF EXISTS "org_admin_all_playoff_tiers"   ON public.playoff_tiers;

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


-- ── public.roster_notes  (080_roster_notes) ───────────────────────────────────
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


-- ── storage.objects – org-documents  (084_org_documents_bucket) ───────────────
DROP POLICY IF EXISTS "org_documents_service_role_all" ON storage.objects;

CREATE POLICY "org_documents_service_role_all" ON storage.objects
  FOR ALL
  USING  (bucket_id = 'org-documents' AND (SELECT auth.role()) = 'service_role')
  WITH CHECK (bucket_id = 'org-documents' AND (SELECT auth.role()) = 'service_role');


-- ── public.league_documents  (086_league_documents) ──────────────────────────
-- Guard: only run if the table was created by migration 086.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'league_documents'
  ) THEN
    DROP POLICY IF EXISTS "org_admin_manage_league_documents" ON public.league_documents;
    DROP POLICY IF EXISTS "public_read_league_documents"      ON public.league_documents;

    EXECUTE $policy$
      CREATE POLICY "org_admin_manage_league_documents" ON public.league_documents
        FOR ALL USING (
          EXISTS (
            SELECT 1 FROM public.org_members om
            WHERE om.organization_id = league_documents.organization_id
              AND om.user_id = (SELECT auth.uid())
              AND om.role IN ('org_admin', 'league_admin')
              AND om.status = 'active'
          )
        )
    $policy$;

    EXECUTE $policy$
      CREATE POLICY "public_read_league_documents" ON public.league_documents
        FOR SELECT USING (true)
    $policy$;
  END IF;
END;
$$;


COMMIT;
