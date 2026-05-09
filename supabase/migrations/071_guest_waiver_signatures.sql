-- Allow guest (unauthenticated) players to sign waivers via a shareable link.
-- Previously user_id was NOT NULL; guests have no Supabase auth identity.

-- 1. Make user_id optional
ALTER TABLE public.waiver_signatures ALTER COLUMN user_id DROP NOT NULL;

-- 2. Add guest-identity columns
ALTER TABLE public.waiver_signatures
  ADD COLUMN IF NOT EXISTS guest_name  text,
  ADD COLUMN IF NOT EXISTS guest_email text;

-- 3. Integrity: every row must be tied to either an auth user or a guest email
ALTER TABLE public.waiver_signatures
  ADD CONSTRAINT waiver_sig_identity_check
  CHECK (user_id IS NOT NULL OR guest_email IS NOT NULL);

-- 4. Deduplicate guest signatures: one per (email, waiver, league)
--    COALESCE handles NULL league_id (org-level signing with no event).
CREATE UNIQUE INDEX IF NOT EXISTS waiver_signatures_guest_unique
  ON public.waiver_signatures(waiver_id, guest_email, COALESCE(league_id::text, 'none'))
  WHERE user_id IS NULL AND guest_email IS NOT NULL;
