-- Store the Railway custom domain ID so we can delete it via the API when the org removes their domain
ALTER TABLE public.org_branding
  ADD COLUMN IF NOT EXISTS railway_domain_id TEXT;
