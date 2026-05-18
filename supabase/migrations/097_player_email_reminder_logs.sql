-- Add email_reminders_enabled opt-out flag to profiles (default true = opted in)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_reminders_enabled boolean NOT NULL DEFAULT true;

-- Log table to track per-player per-org per-day email reminders (prevents duplicates)
CREATE TABLE IF NOT EXISTS public.player_email_reminder_logs (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id  uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  log_date         date        NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, organization_id, log_date)
);

CREATE INDEX IF NOT EXISTS player_email_reminder_logs_lookup_idx
  ON public.player_email_reminder_logs (organization_id, log_date);

ALTER TABLE public.player_email_reminder_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_email_reminder_logs" ON public.player_email_reminder_logs;
CREATE POLICY "service_role_email_reminder_logs" ON public.player_email_reminder_logs
  USING (true);
