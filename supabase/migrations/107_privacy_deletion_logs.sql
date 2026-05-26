-- Audit log for self-service account deletions.
-- Retained for 7 years as required by Canadian privacy law.

CREATE TABLE IF NOT EXISTS public.account_deletion_logs (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          text        NOT NULL,   -- text, not FK — auth user no longer exists after deletion
  email_hash       text,                   -- SHA-256 of email for audit without re-identifying
  organization_id  uuid        REFERENCES public.organizations(id) ON DELETE SET NULL,
  requested_at     timestamptz NOT NULL DEFAULT now(),
  ip_address       text,
  reason           text                    -- optional reason provided by user
);

CREATE INDEX IF NOT EXISTS account_deletion_logs_user_idx ON public.account_deletion_logs (user_id);
CREATE INDEX IF NOT EXISTS account_deletion_logs_org_idx  ON public.account_deletion_logs (organization_id);

ALTER TABLE public.account_deletion_logs ENABLE ROW LEVEL SECURITY;

-- Only platform admins / service role can read the log
DROP POLICY IF EXISTS "service_all_deletion_logs" ON public.account_deletion_logs;
CREATE POLICY "service_all_deletion_logs" ON public.account_deletion_logs
  FOR ALL USING (auth.role() = 'service_role');
