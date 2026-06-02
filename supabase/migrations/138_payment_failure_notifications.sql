-- Admin toggle for "notify admins when a Stripe payment fails". On by default.
ALTER TABLE public.org_notification_settings
  ADD COLUMN IF NOT EXISTS payment_failure_notifications_enabled boolean NOT NULL DEFAULT true;
