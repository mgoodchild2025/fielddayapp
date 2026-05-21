-- Add maintenance mode fields to organizations
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS maintenance_mode    boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS maintenance_message text,
  ADD COLUMN IF NOT EXISTS maintenance_until   timestamptz;
