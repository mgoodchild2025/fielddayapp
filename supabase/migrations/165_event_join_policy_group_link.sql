-- 165_event_join_policy_group_link.sql
-- Drop-in / pickup events get a proper "event join policy" with three modes:
--   public  — anyone can self-register
--   link    — only people with the shared group link (matching access_token) can
--   private — individual invite only (existing pickup_invites flow)
-- (Team join policy stays for team events; it should no longer gate drop-ins.)

-- Shared secret for the group-link mode. Always present; only enforced when the
-- policy is 'link'. Existing rows get a token via the default.
ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS access_token uuid NOT NULL DEFAULT gen_random_uuid();

-- Allow the new 'link' value on the existing join-policy check.
ALTER TABLE public.leagues DROP CONSTRAINT IF EXISTS leagues_pickup_join_policy_check;
ALTER TABLE public.leagues
  ADD CONSTRAINT leagues_pickup_join_policy_check
  CHECK (pickup_join_policy IN ('public', 'link', 'private'));
