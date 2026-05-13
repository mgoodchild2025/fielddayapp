-- Add YouTube social link to org branding.
-- (social_tiktok already exists from the initial schema.)
ALTER TABLE public.org_branding
  ADD COLUMN IF NOT EXISTS social_youtube text;
