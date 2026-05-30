-- Allow targeting individual players in announcements
ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS recipient_user_ids uuid[];

-- Widen the audience_type check to include 'players'
ALTER TABLE public.announcements
  DROP CONSTRAINT IF EXISTS announcements_audience_type_check;

ALTER TABLE public.announcements
  ADD CONSTRAINT announcements_audience_type_check
    CHECK (audience_type IN ('org', 'league', 'team', 'players'));
