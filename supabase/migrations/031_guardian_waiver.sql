-- Support guardian signatures for players under 18.
-- guardian_relationship IS NOT NULL means the waiver was signed by a parent/guardian
-- on behalf of a minor. The guardian's name is stored in the existing signature_name column.
-- The player's own name is available via the user_id → profiles join.

ALTER TABLE public.waiver_signatures
  ADD COLUMN IF NOT EXISTS guardian_relationship text
    CHECK (guardian_relationship IN ('parent', 'legal_guardian'));
