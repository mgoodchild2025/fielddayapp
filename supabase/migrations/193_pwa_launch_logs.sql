-- Install metrics (phase 6 of phone alerts). One row per member per org per
-- local day, recording whether the app was opened from the home screen
-- (standalone) or in a browser tab, and the platform. Upserted by
-- actions/pwa.ts#logPwaLaunch once per browser session; read by /super/phone-alerts.

CREATE TABLE IF NOT EXISTS public.pwa_launch_logs (
  organization_id  uuid    NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id          uuid    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day              date    NOT NULL,
  standalone       boolean NOT NULL,          -- opened from the home-screen icon
  platform         text    NOT NULL,          -- 'ios' | 'android' | 'desktop' | 'other'
  launches         int     NOT NULL DEFAULT 1,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id, day)
);

CREATE INDEX IF NOT EXISTS pwa_launch_logs_org_day_idx ON public.pwa_launch_logs (organization_id, day DESC);

-- Service-role only (no client access): enable RLS with no policies.
ALTER TABLE public.pwa_launch_logs ENABLE ROW LEVEL SECURITY;
