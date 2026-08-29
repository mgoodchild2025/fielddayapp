-- 188_fiscal_year_start.sql
-- Org fiscal year start month (1 = January = calendar year). Drives the
-- financial report's default range and its "This/Last fiscal year" presets.
ALTER TABLE public.org_branding
  ADD COLUMN IF NOT EXISTS fiscal_year_start_month integer NOT NULL DEFAULT 1
  CHECK (fiscal_year_start_month BETWEEN 1 AND 12);
