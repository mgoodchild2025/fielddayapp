-- Add checkin_sound column to org_branding
-- NULL = no sound (off by default)
-- Valid values: 'ding' | 'chime' | 'beep' | 'success' | 'airhorn'
ALTER TABLE org_branding
  ADD COLUMN IF NOT EXISTS checkin_sound text DEFAULT NULL;
