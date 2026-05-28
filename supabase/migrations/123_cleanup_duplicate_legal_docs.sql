-- Remove duplicate legal documents created by migration 121 that were
-- superseded by the canonical tenant-consent slugs in migration 122.
--
-- Kept:  'terms'          (Terms of Service — used by tenant consent system)
-- Kept:  'dpa'            (Data Processing Addendum — used by tenant consent system)
-- Kept:  'tenant-privacy' (Privacy Policy for Tenants — used by tenant consent system)
-- Kept:  'privacy-policy' (General consumer-facing privacy policy — distinct)
-- Kept:  'sub-processors' (Sub-processor list — informational)
-- Kept:  'cookie-policy'  (Cookie policy)
--
-- Removed: 'terms-of-service'         → duplicate of 'terms'
-- Removed: 'data-processing-agreement'→ duplicate of 'dpa'
--
-- The immutability trigger on legal_document_versions blocks ALL deletes,
-- including cascades from the parent table. Disable it for this cleanup,
-- then re-enable it immediately after.

ALTER TABLE public.legal_document_versions DISABLE TRIGGER no_delete_legal_versions;

DELETE FROM public.legal_documents WHERE slug = 'terms-of-service';
DELETE FROM public.legal_documents WHERE slug = 'data-processing-agreement';

ALTER TABLE public.legal_document_versions ENABLE TRIGGER no_delete_legal_versions;
