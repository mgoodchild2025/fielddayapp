-- ── Legal Document Management ─────────────────────────────────────────────────
-- Stores Fieldday's platform-level legal documents (Privacy Policy, ToS, DPA, etc.)
-- with full version history. Only platform_admins can write; public can read published docs.

CREATE TABLE IF NOT EXISTS public.legal_documents (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text        NOT NULL UNIQUE,          -- e.g. 'privacy-policy'
  title           text        NOT NULL,
  description     text,                                 -- short summary shown in lists
  content         text        NOT NULL DEFAULT '',      -- current DRAFT markdown content
  published_at    timestamptz,                          -- null = never published (draft only)
  effective_date  date,                                 -- date shown to users ("Effective: …")
  version         text,                                 -- e.g. '2.1'
  is_published    boolean     NOT NULL DEFAULT false,
  published_content text,                               -- snapshot of last published content
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.legal_document_versions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     uuid        NOT NULL REFERENCES public.legal_documents(id) ON DELETE CASCADE,
  version         text        NOT NULL,                 -- e.g. '2.1'
  content         text        NOT NULL,
  effective_date  date,
  published_at    timestamptz NOT NULL DEFAULT now(),
  published_by    uuid        REFERENCES auth.users(id),
  notes           text,                                 -- optional release notes
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Prevent mutation of published versions (immutability enforcement)
CREATE OR REPLACE FUNCTION public.prevent_version_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Legal document versions are immutable and cannot be modified';
END;
$$;

DROP TRIGGER IF EXISTS no_update_legal_versions ON public.legal_document_versions;
CREATE TRIGGER no_update_legal_versions
  BEFORE UPDATE ON public.legal_document_versions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_version_mutation();

DROP TRIGGER IF EXISTS no_delete_legal_versions ON public.legal_document_versions;
CREATE TRIGGER no_delete_legal_versions
  BEFORE DELETE ON public.legal_document_versions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_version_mutation();

-- Auto-update updated_at on legal_documents
CREATE OR REPLACE FUNCTION public.update_legal_document_timestamp()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_legal_document_updated_at ON public.legal_documents;
CREATE TRIGGER set_legal_document_updated_at
  BEFORE UPDATE ON public.legal_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_legal_document_timestamp();

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.legal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_document_versions ENABLE ROW LEVEL SECURITY;

-- Anyone can read published documents
DROP POLICY IF EXISTS "public_read_published_legal_docs" ON public.legal_documents;
CREATE POLICY "public_read_published_legal_docs" ON public.legal_documents
  FOR SELECT USING (is_published = true);

-- Platform admins can read all (including drafts)
DROP POLICY IF EXISTS "platform_admin_read_all_legal_docs" ON public.legal_documents;
CREATE POLICY "platform_admin_read_all_legal_docs" ON public.legal_documents
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.platform_role = 'platform_admin'
    )
  );

-- Platform admins can insert/update legal documents
DROP POLICY IF EXISTS "platform_admin_write_legal_docs" ON public.legal_documents;
CREATE POLICY "platform_admin_write_legal_docs" ON public.legal_documents
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.platform_role = 'platform_admin'
    )
  );

-- Anyone can read published versions
DROP POLICY IF EXISTS "public_read_legal_versions" ON public.legal_document_versions;
CREATE POLICY "public_read_legal_versions" ON public.legal_document_versions
  FOR SELECT USING (true);

-- Platform admins can insert versions (immutability trigger prevents update/delete)
DROP POLICY IF EXISTS "platform_admin_insert_legal_versions" ON public.legal_document_versions;
CREATE POLICY "platform_admin_insert_legal_versions" ON public.legal_document_versions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.platform_role = 'platform_admin'
    )
  );

-- ── Seed data ─────────────────────────────────────────────────────────────────

INSERT INTO public.legal_documents (slug, title, description, content, is_published)
VALUES
  (
    'privacy-policy',
    'Privacy Policy',
    'How Fieldday collects, uses, and protects your personal information.',
    E'# Privacy Policy\n\n*Draft — publish to make this visible to users.*\n\nThis privacy policy describes how Fieldday Sports Technology Inc. collects, uses, and shares information about you when you use our services.\n\n## Information We Collect\n\n...\n\n## How We Use Your Information\n\n...\n\n## Contact Us\n\nIf you have questions about this policy, contact us at privacy@fielddayapp.ca.',
    false
  ),
  (
    'terms-of-service',
    'Terms of Service',
    'The terms and conditions governing your use of Fieldday.',
    E'# Terms of Service\n\n*Draft — publish to make this visible to users.*\n\nBy using Fieldday, you agree to these terms.\n\n## Acceptance of Terms\n\n...\n\n## Use of Service\n\n...',
    false
  ),
  (
    'data-processing-agreement',
    'Data Processing Agreement',
    'DPA for organizations using Fieldday to process member personal data.',
    E'# Data Processing Agreement\n\n*Draft — publish to make this visible to users.*\n\nThis Data Processing Agreement ("DPA") is incorporated into and forms part of the agreement between Fieldday Sports Technology Inc. and the Customer.\n\n## Definitions\n\n...',
    false
  ),
  (
    'sub-processors',
    'Sub-Processor List',
    'Third-party services Fieldday uses to process personal data.',
    E'# Sub-Processor List\n\n*Draft — publish to make this visible to users.*\n\nFieldday uses the following sub-processors to deliver our services:\n\n| Sub-Processor | Purpose | Location |\n|---|---|---|\n| Supabase | Database & Authentication | USA |\n| Stripe | Payment Processing | USA |\n| Resend | Transactional Email | USA |\n| Twilio | SMS Notifications | USA |',
    false
  ),
  (
    'cookie-policy',
    'Cookie Policy',
    'How Fieldday uses cookies and similar tracking technologies.',
    E'# Cookie Policy\n\n*Draft — publish to make this visible to users.*\n\nThis cookie policy explains how Fieldday uses cookies and similar technologies.\n\n## What Are Cookies\n\n...',
    false
  )
ON CONFLICT (slug) DO NOTHING;
