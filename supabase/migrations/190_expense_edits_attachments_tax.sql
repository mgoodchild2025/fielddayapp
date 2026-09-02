-- 190_expense_edits_attachments_tax.sql
-- Three finance upgrades:
--   1. Recoverable sales tax paid on expenses (input tax credits). The report
--      shows tax collected − tax paid = net remittance. Stored per row as the
--      RECOVERABLE portion only (HST/GST/QST yes; BC/SK/MB PST generally not).
--   2. Multiple attachments per expense (invoice + receipt + contract…) in a
--      child table, replacing the single receipt_path column. Existing receipts
--      are migrated in; the old column is left in place but no longer written.
--   3. (No schema needed for edit — added in app code.)

ALTER TABLE public.event_expenses
  ADD COLUMN IF NOT EXISTS tax_cents integer NOT NULL DEFAULT 0 CHECK (tax_cents >= 0);
ALTER TABLE public.org_overhead_expenses
  ADD COLUMN IF NOT EXISTS tax_cents integer NOT NULL DEFAULT 0 CHECK (tax_cents >= 0);

-- Polymorphic by design: an attachment belongs to an event expense OR an org
-- overhead expense. No FK across the two tables — the app deletes attachments
-- (rows + storage objects) when it deletes the parent expense.
CREATE TABLE IF NOT EXISTS public.expense_attachments (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind            text        NOT NULL CHECK (kind IN ('event', 'overhead')),
  expense_id      uuid        NOT NULL,
  path            text        NOT NULL,
  label           text,
  file_name       text,
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS expense_attachments_expense_idx ON public.expense_attachments (kind, expense_id);
CREATE INDEX IF NOT EXISTS expense_attachments_org_idx ON public.expense_attachments (organization_id);

ALTER TABLE public.expense_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_expense_attachments" ON public.expense_attachments;
CREATE POLICY "service_role_all_expense_attachments" ON public.expense_attachments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "org_admin_expense_attachments" ON public.expense_attachments;
CREATE POLICY "org_admin_expense_attachments" ON public.expense_attachments
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.organization_id = expense_attachments.organization_id
        AND om.user_id = (SELECT auth.uid())
        AND om.role IN ('org_admin', 'league_admin')
        AND om.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.organization_id = expense_attachments.organization_id
        AND om.user_id = (SELECT auth.uid())
        AND om.role IN ('org_admin', 'league_admin')
        AND om.status = 'active'
    )
  );

-- Migrate existing single receipts into the attachments table (idempotent:
-- skips rows whose path is already present).
INSERT INTO public.expense_attachments (organization_id, kind, expense_id, path, label, created_by)
SELECT e.organization_id, 'event', e.id, e.receipt_path, 'Receipt', e.created_by
FROM public.event_expenses e
WHERE e.receipt_path IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.expense_attachments a WHERE a.path = e.receipt_path);

INSERT INTO public.expense_attachments (organization_id, kind, expense_id, path, label, created_by)
SELECT o.organization_id, 'overhead', o.id, o.receipt_path, 'Receipt', o.created_by
FROM public.org_overhead_expenses o
WHERE o.receipt_path IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.expense_attachments a WHERE a.path = o.receipt_path);
