-- Store the DNS records Railway requires for each custom domain.
-- Shown to org admins in the branding settings so they can configure DNS themselves.
ALTER TABLE public.org_branding
  ADD COLUMN IF NOT EXISTS railway_cname_host  TEXT,  -- e.g. "www"
  ADD COLUMN IF NOT EXISTS railway_cname_value TEXT,  -- e.g. "abc123.up.railway.app"
  ADD COLUMN IF NOT EXISTS railway_txt_host    TEXT,  -- e.g. "_railway.www"
  ADD COLUMN IF NOT EXISTS railway_txt_value   TEXT;  -- e.g. "railway-verify=abc123"
