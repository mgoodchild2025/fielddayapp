-- Persist the delivery channel so scheduled announcements deliver via the
-- channel the admin chose (previously only email was used for scheduled sends).
ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'email'
    CHECK (channel IN ('email', 'sms', 'both'));
