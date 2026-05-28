-- ── Tenant Consent Capture ────────────────────────────────────────────────────
-- Records every instance of a tenant (organization) admin accepting Fieldday's
-- legal agreements. Append-only — UPDATE and DELETE are blocked by trigger.

-- ── 1. Add requires_reconsent to the legal document system ───────────────────

ALTER TABLE public.legal_documents
  ADD COLUMN IF NOT EXISTS requires_reconsent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reconsent_summary   text;

ALTER TABLE public.legal_document_versions
  ADD COLUMN IF NOT EXISTS requires_reconsent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reconsent_summary   text;

-- ── 2. Seed the three tenant consent documents ───────────────────────────────

INSERT INTO public.legal_documents (slug, title, description, content, is_published)
VALUES
  (
    'terms',
    'Terms of Service',
    'The terms and conditions governing your use of Fieldday as an organization.',
    E'# Terms of Service\n\n*Draft — publish to make this visible to tenants.*\n\nBy creating an organization on Fieldday, you agree to these terms on behalf of your organization.\n\n## Acceptance of Terms\n\nThese Terms of Service ("Terms") govern your access to and use of Fieldday ("Service") provided by Fieldday Sports Technology Inc. ("Fieldday", "we", "our").\n\nBy creating an organization account you agree to be bound by these Terms, the Privacy Policy for Tenants, and the Data Processing Addendum.\n\n## Description of Service\n\n...\n\n## Contact\n\nquestions@fielddayapp.ca',
    false
  ),
  (
    'tenant-privacy',
    'Privacy Policy for Tenants',
    'How Fieldday collects and processes data on behalf of organizations.',
    E'# Privacy Policy for Tenants\n\n*Draft — publish to make this visible to tenants.*\n\nThis policy describes how Fieldday Sports Technology Inc. collects and uses information from organizations and their administrators.\n\n## Information We Collect\n\n...',
    false
  ),
  (
    'dpa',
    'Data Processing Addendum',
    'DPA governing Fieldday''s processing of personal data on behalf of tenant organizations.',
    E'# Data Processing Addendum\n\n*Draft — publish to make this visible to tenants.*\n\nThis Data Processing Addendum ("DPA") governs how Fieldday Sports Technology Inc. ("Processor") processes personal data on behalf of your organization ("Controller").\n\n## Definitions\n\n...',
    false
  )
ON CONFLICT (slug) DO NOTHING;

-- ── 3. tenant_acceptances table ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tenant_acceptances (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  accepted_by_user_id   uuid        NOT NULL REFERENCES auth.users(id),
  document_slug         text        NOT NULL,
  document_version      text        NOT NULL,
  document_version_id   uuid        REFERENCES public.legal_document_versions(id),
  acceptance_type       text        NOT NULL
                          CHECK (acceptance_type IN ('onboarding', 'reacceptance', 'manual')),
  accepted_at           timestamptz NOT NULL DEFAULT now(),
  ip_address            inet,
  user_agent            text,
  notes                 text
);

CREATE INDEX IF NOT EXISTS idx_tenant_acceptances_org
  ON public.tenant_acceptances (organization_id);
CREATE INDEX IF NOT EXISTS idx_tenant_acceptances_user
  ON public.tenant_acceptances (accepted_by_user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_acceptances_slug
  ON public.tenant_acceptances (document_slug);
CREATE INDEX IF NOT EXISTS idx_tenant_acceptances_accepted_at
  ON public.tenant_acceptances (accepted_at);

-- Append-only enforcement: block UPDATE and DELETE at the DB level
CREATE OR REPLACE FUNCTION public.prevent_acceptance_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Tenant acceptance records are append-only and cannot be modified or deleted';
END;
$$;

DROP TRIGGER IF EXISTS no_update_tenant_acceptances ON public.tenant_acceptances;
CREATE TRIGGER no_update_tenant_acceptances
  BEFORE UPDATE ON public.tenant_acceptances
  FOR EACH ROW EXECUTE FUNCTION public.prevent_acceptance_mutation();

DROP TRIGGER IF EXISTS no_delete_tenant_acceptances ON public.tenant_acceptances;
CREATE TRIGGER no_delete_tenant_acceptances
  BEFORE DELETE ON public.tenant_acceptances
  FOR EACH ROW EXECUTE FUNCTION public.prevent_acceptance_mutation();

-- ── 4. RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE public.tenant_acceptances ENABLE ROW LEVEL SECURITY;

-- Org admins can read their own org's acceptances
DROP POLICY IF EXISTS "org_admin_read_own_acceptances" ON public.tenant_acceptances;
CREATE POLICY "org_admin_read_own_acceptances" ON public.tenant_acceptances
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.organization_id = tenant_acceptances.organization_id
        AND om.user_id = (SELECT auth.uid())
        AND om.role IN ('org_admin')
        AND om.status = 'active'
    )
  );

-- Platform admins can read all acceptances
DROP POLICY IF EXISTS "platform_admin_read_all_acceptances" ON public.tenant_acceptances;
CREATE POLICY "platform_admin_read_all_acceptances" ON public.tenant_acceptances
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.platform_role = 'platform_admin'
    )
  );

-- Platform admins can insert manual acceptance records
DROP POLICY IF EXISTS "platform_admin_insert_manual_acceptances" ON public.tenant_acceptances;
CREATE POLICY "platform_admin_insert_manual_acceptances" ON public.tenant_acceptances
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.platform_role = 'platform_admin'
    )
  );

-- Service role always bypasses RLS (used for onboarding + reacceptance writes)
