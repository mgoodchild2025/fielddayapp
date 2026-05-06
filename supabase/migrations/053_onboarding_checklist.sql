-- Track when an org admin dismisses the getting-started checklist
ALTER TABLE public.org_branding
  ADD COLUMN IF NOT EXISTS onboarding_dismissed_at timestamptz;
