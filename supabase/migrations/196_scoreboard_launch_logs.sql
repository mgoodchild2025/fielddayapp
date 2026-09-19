-- Scoreboard adoption — anonymous.
--
-- The scoreboard is deliberately login-optional and runs on the platform apex
-- as well as org sites, so most installs have no user and no org to attribute
-- them to. pwa_launch_logs (migration 193) is keyed by org + user and can't
-- hold them.
--
-- This table therefore identifies a DEVICE, never a person: `device_id` is a
-- random value the browser generates and keeps in its own localStorage. No
-- user id, no IP, no user-agent string — only a coarse platform bucket.
-- organization_id is filled only when the visit happened on an org host, and
-- is null on the apex.
--
-- One row per device per day: repeat launches bump `launches` rather than
-- adding rows.

CREATE TABLE IF NOT EXISTS public.scoreboard_launch_logs (
  device_id        text        NOT NULL,
  day              date        NOT NULL,
  organization_id  uuid        REFERENCES public.organizations(id) ON DELETE SET NULL,
  -- Opened from the home screen rather than a browser tab. On iOS this is the
  -- ONLY install signal there is — Safari never fires the appinstalled event.
  standalone       boolean     NOT NULL DEFAULT false,
  platform         text        NOT NULL DEFAULT 'other',
  launches         int         NOT NULL DEFAULT 1,
  -- Set when the browser reported a completed install on this day. Chrome and
  -- desktop only; absent on iOS, so it is a floor, not the true install count.
  installed_at     timestamptz,
  first_seen_at    timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (device_id, day)
);

CREATE INDEX IF NOT EXISTS scoreboard_launch_logs_day_idx
  ON public.scoreboard_launch_logs (day DESC);
CREATE INDEX IF NOT EXISTS scoreboard_launch_logs_org_day_idx
  ON public.scoreboard_launch_logs (organization_id, day DESC) WHERE organization_id IS NOT NULL;

-- Service-role only (no client access): enable RLS with no policies.
ALTER TABLE public.scoreboard_launch_logs ENABLE ROW LEVEL SECURITY;
