-- Tournament / event check-in support

-- Unique token per registration — encoded in the player's QR code
ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS checkin_token uuid NOT NULL DEFAULT gen_random_uuid();

-- When the player was checked in
ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS checked_in_at timestamptz;

-- Who scanned/marked them (null = self check-in)
ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS checked_in_by uuid REFERENCES auth.users(id);

-- Fast token lookup for the scanner
CREATE UNIQUE INDEX IF NOT EXISTS registrations_checkin_token_idx
  ON public.registrations (checkin_token);
