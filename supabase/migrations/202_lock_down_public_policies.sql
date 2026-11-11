-- Security review, Nov 2026 — applied to production by hand on 2026-11-11.
--
-- Two mistakes, repeated across earlier migrations, left these open to anyone
-- holding the app's public key (the key ships to every browser):
--
--   1. A policy meant for the service role but written without `TO service_role`
--      applies to EVERY role, anon included. `USING (true)` or
--      `USING (bucket_id = '…')` on its own is "everyone".
--   2. A SECURITY DEFINER function is executable by PUBLIC unless that is
--      revoked. Granting to service_role does not take it away from the rest.
--
-- The server reads and writes all of these with the service role, which
-- bypasses RLS, so nothing in the app depends on the removed access.
-- Safe to re-run.

-- ── Functions: service role only ────────────────────────────────────────────
-- purge_organization deletes an org and everything under it.
REVOKE ALL ON FUNCTION public.purge_organization(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_organization(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.bump_sponsor_stats(uuid, uuid, text[], text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bump_sponsor_stats(uuid, uuid, text[], text) TO service_role;

-- ── Profiles: no direct client updates ──────────────────────────────────────
-- The policy had no column limit, so a user could set their own platform_role
-- (platform admin), email or mfa_grace_until. Every profile write in the app
-- goes through the service role.
DROP POLICY IF EXISTS "profiles_self_update" ON public.profiles;

-- ── Stripe keys: no direct client access ────────────────────────────────────
-- Let org AND league admins read and replace stripe_secret_key /
-- stripe_webhook_secret through PostgREST.
DROP POLICY IF EXISTS "Org admins manage payment settings" ON public.org_payment_settings;

-- ── Storage: service role only ──────────────────────────────────────────────
-- expense-receipts and admin-documents are PRIVATE buckets; these policies let
-- anyone list, read, overwrite and delete them. event-logos stays publicly
-- readable through its own SELECT policy.
DROP POLICY IF EXISTS "service role manages expense receipts" ON storage.objects;
CREATE POLICY "service role manages expense receipts" ON storage.objects
  FOR ALL TO service_role
  USING (bucket_id = 'expense-receipts') WITH CHECK (bucket_id = 'expense-receipts');

DROP POLICY IF EXISTS "service role manages admin documents" ON storage.objects;
CREATE POLICY "service role manages admin documents" ON storage.objects
  FOR ALL TO service_role
  USING (bucket_id = 'admin-documents') WITH CHECK (bucket_id = 'admin-documents');

DROP POLICY IF EXISTS "service role manages event logos" ON storage.objects;
CREATE POLICY "service role manages event logos" ON storage.objects
  FOR ALL TO service_role
  USING (bucket_id = 'event-logos') WITH CHECK (bucket_id = 'event-logos');

-- content-images: any signed-in user could upload to it and delete any org's
-- images. Uploads go through actions/content-images.ts (service role); public
-- read stays.
DROP POLICY IF EXISTS "authenticated_upload_content_images" ON storage.objects;
DROP POLICY IF EXISTS "authenticated_delete_content_images" ON storage.objects;

-- ── Plan tables and reminder logs: service role only ────────────────────────
DROP POLICY IF EXISTS "plan_configs_service" ON public.plan_configs;
CREATE POLICY "plan_configs_service" ON public.plan_configs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "org_feature_overrides_service" ON public.org_feature_overrides;
CREATE POLICY "org_feature_overrides_service" ON public.org_feature_overrides
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_email_reminder_logs" ON public.player_email_reminder_logs;
CREATE POLICY "service_role_email_reminder_logs" ON public.player_email_reminder_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_session_reminder_logs" ON public.session_reminder_logs;
CREATE POLICY "service_role_session_reminder_logs" ON public.session_reminder_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);
