-- Reminder dedup log for pickup/drop-in event sessions (event_sessions).
-- One row per (session, user) once a day-before reminder has been sent,
-- so the cron never double-sends across runs. Service-role only.
CREATE TABLE IF NOT EXISTS public.session_reminder_logs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid        NOT NULL REFERENCES public.event_sessions(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, user_id)
);

CREATE INDEX IF NOT EXISTS session_reminder_logs_session_idx
  ON public.session_reminder_logs (session_id);

ALTER TABLE public.session_reminder_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_session_reminder_logs" ON public.session_reminder_logs;
CREATE POLICY "service_role_session_reminder_logs" ON public.session_reminder_logs
  USING (true);
