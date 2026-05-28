-- Fix the FK on tenant_acceptances.accepted_by_user_id to reference
-- public.profiles(id) instead of auth.users(id).
--
-- The original migration (122) referenced auth.users(id), which prevents
-- PostgREST from traversing the FK to the profiles table for joins.
-- Because getOrgAcceptances uses:
--   profiles!tenant_acceptances_accepted_by_user_id_fkey(full_name, email)
-- the query silently errors when the FK points at auth.users, causing the
-- function to return [] even when acceptance rows exist.
--
-- Keeping the same constraint name preserves the PostgREST join hint in
-- all existing query code. profiles.id is always equal to auth.users.id
-- (profiles.id is itself a FK to auth.users.id), so there is no data
-- integrity difference.

ALTER TABLE public.tenant_acceptances
  DROP CONSTRAINT IF EXISTS tenant_acceptances_accepted_by_user_id_fkey;

ALTER TABLE public.tenant_acceptances
  ADD CONSTRAINT tenant_acceptances_accepted_by_user_id_fkey
  FOREIGN KEY (accepted_by_user_id)
  REFERENCES public.profiles(id);
