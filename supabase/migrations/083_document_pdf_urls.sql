-- Add PDF attachment columns for league documents and org waivers
-- Admins can upload a PDF as an alternative or supplement to rich-text content.
-- URLs point to public objects in the 'org-documents' storage bucket.

ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS rules_pdf_url  text,
  ADD COLUMN IF NOT EXISTS format_pdf_url text;

ALTER TABLE public.waivers
  ADD COLUMN IF NOT EXISTS pdf_url text;
