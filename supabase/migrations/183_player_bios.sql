-- Broadcast bios (S1): a player's TV card.
--
-- One row per player per org: the lower-third's contents — photo, number,
-- position, hometown, years playing, one 120-char fact — plus the flag that
-- matters most: show_on_displays is OPT-IN, DEFAULT OFF. Rotating on a gym TV
-- is a different exposure than a roster line; nobody appears on screen who
-- didn't ask to. Admins can hide any bio (hidden_by_admin) without deleting
-- the player's work.

CREATE TABLE IF NOT EXISTS public.player_bios (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hero_photo_url   text,                 -- card photo; null = fall back to profiles.avatar_url
  jersey_number    text,                 -- text: "07", "00" and "MVP" are all real numbers somewhere
  position         text,
  hometown         text,
  years_playing    int         CHECK (years_playing IS NULL OR (years_playing >= 0 AND years_playing <= 99)),
  tagline          text        CHECK (tagline IS NULL OR char_length(tagline) <= 120),
  show_on_displays boolean     NOT NULL DEFAULT false,
  hidden_by_admin  boolean     NOT NULL DEFAULT false,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS player_bios_display_idx
  ON public.player_bios (organization_id)
  WHERE show_on_displays AND NOT hidden_by_admin;

ALTER TABLE public.player_bios ENABLE ROW LEVEL SECURITY;

-- Readable (bio cards render on public team pages and no-auth TV URLs);
-- all writes go through guarded server actions on the service role.
DROP POLICY IF EXISTS "player_bios_read" ON public.player_bios;
CREATE POLICY "player_bios_read" ON public.player_bios FOR SELECT USING (true);
