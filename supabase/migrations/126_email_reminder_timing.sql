-- Per-org email game reminder settings
ALTER TABLE public.org_notification_settings
  ADD COLUMN IF NOT EXISTS email_game_reminders_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_reminder_hours_before  integer NOT NULL DEFAULT 24;
