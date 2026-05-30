-- Captain/coach prep email — sent 48h before an event start
-- Toggle on org_notification_settings
ALTER TABLE public.org_notification_settings
  ADD COLUMN IF NOT EXISTS captain_prep_email_enabled boolean NOT NULL DEFAULT false;

-- Dedup log: one prep email per (league, team)
CREATE TABLE IF NOT EXISTS public.league_captain_prep_logs (
  league_id  uuid        NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  team_id    uuid        NOT NULL REFERENCES public.teams(id)   ON DELETE CASCADE,
  sent_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (league_id, team_id)
);

ALTER TABLE public.league_captain_prep_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "captain_prep_logs_service_all" ON public.league_captain_prep_logs;
CREATE POLICY "captain_prep_logs_service_all" ON public.league_captain_prep_logs
  FOR ALL USING (auth.role() = 'service_role');
