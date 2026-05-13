-- Add opt-in flag for players to share their contact info with teammates.
-- Defaults to false so contact details are hidden until the player enables it.
-- Org admins bypass this flag and always see contact info via service role queries.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS show_contact_info boolean NOT NULL DEFAULT false;
