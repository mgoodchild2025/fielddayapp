-- Add a per-organizer flag controlling whether their contact info (email/phone)
-- is displayed to participants on the public event page.
-- Defaults to true so existing organizers retain their current behaviour.
ALTER TABLE public.league_organizers
  ADD COLUMN IF NOT EXISTS show_contact_info boolean NOT NULL DEFAULT true;
