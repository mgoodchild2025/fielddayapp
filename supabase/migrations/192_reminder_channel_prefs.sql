-- Per-player reminder channel preferences (phase 4 of phone alerts).
--
-- push_reminders_enabled: game reminders (night-before digest, game-day
--   morning, org-configured pre-game minutes, session reminders) also land in
--   the bell and as a push on any phone the player installed the org site on.
-- sms_also_when_push: by default a player who can receive push for this org
--   is NOT texted the same reminder (push is free, SMS costs the org). Turning
--   this on keeps the text as well. Players with no push subscription are
--   unaffected — SMS behaves exactly as before.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS push_reminders_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sms_also_when_push     boolean NOT NULL DEFAULT false;
