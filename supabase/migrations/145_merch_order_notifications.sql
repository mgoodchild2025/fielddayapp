-- Opt-in flag for merchandise order admin notifications.
-- Default false (opt-in, not on by default like payment failure alerts).
ALTER TABLE public.org_notification_settings
  ADD COLUMN IF NOT EXISTS merch_order_notifications_enabled boolean NOT NULL DEFAULT false;
