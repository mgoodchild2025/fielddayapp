-- Track when an org admin first saves their website settings
-- Used by the onboarding checklist to mark the "Configure your website" step complete
ALTER TABLE public.org_branding
  ADD COLUMN IF NOT EXISTS website_configured_at timestamptz;
