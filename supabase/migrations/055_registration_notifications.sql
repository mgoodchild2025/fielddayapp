-- Add admin registration notification settings to org_notification_settings

ALTER TABLE public.org_notification_settings
  ADD COLUMN IF NOT EXISTS registration_notifications_enabled boolean NOT NULL DEFAULT false,
  -- Optional override email; when NULL all org_admin members receive the notification
  ADD COLUMN IF NOT EXISTS registration_notification_email text NULL;
