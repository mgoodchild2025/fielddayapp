-- Log table to prevent duplicate waiver reminder emails per team per league event.
-- One row is inserted per team when the reminder is sent; the unique constraint
-- on (league_id, team_id) ensures concurrent cron runs don't double-send.

CREATE TABLE IF NOT EXISTS public.league_waiver_reminder_logs (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id        uuid        NOT NULL REFERENCES public.leagues(id)  ON DELETE CASCADE,
  team_id          uuid        NOT NULL REFERENCES public.teams(id)    ON DELETE CASCADE,
  sent_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (league_id, team_id)
);

CREATE INDEX IF NOT EXISTS league_waiver_reminder_logs_league_idx
  ON public.league_waiver_reminder_logs (league_id);

ALTER TABLE public.league_waiver_reminder_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "waiver_reminder_logs_service_all" ON public.league_waiver_reminder_logs;
CREATE POLICY "waiver_reminder_logs_service_all" ON public.league_waiver_reminder_logs
  FOR ALL USING (auth.role() = 'service_role');
