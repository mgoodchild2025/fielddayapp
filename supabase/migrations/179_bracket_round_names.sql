-- Manual brackets M2: admin-named rounds.
--
-- Round names have always been inferred from the bracket size (getRoundName),
-- which is right for generated shapes and wrong for hand-built ones — a
-- custom round is whatever the admin says it is. Stored as a jsonb map of
-- round_number (as a string key) to display name; null / missing keys fall
-- back to the inferred name, so generated brackets are untouched.

ALTER TABLE public.brackets
  ADD COLUMN IF NOT EXISTS round_names jsonb;

COMMENT ON COLUMN public.brackets.round_names IS
  'Admin-set round display names, keyed by round_number (string keys). Null/missing = infer from bracket size.';
