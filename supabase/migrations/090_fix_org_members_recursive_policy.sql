-- Migration 090: Fix infinite recursion in org_members RLS policy
--
-- The "org_members_admin_all" policy created in migration 088 contains a
-- subquery that reads from org_members itself:
--
--   EXISTS (SELECT 1 FROM public.org_members om2 WHERE ...)
--
-- When Postgres evaluates the policy for any query touching org_members via
-- the session client, it re-enters the same policy evaluation → infinite
-- recursion error.
--
-- Fix: replace the self-referencing subquery with a SECURITY DEFINER function
-- that reads org_members without triggering RLS evaluation (security definer
-- functions bypass RLS on the tables they access).
--
-- Note: since all app data queries now use the service_role client (which is
-- already handled by the "org_members_service_all" policy), this policy is
-- only relevant for any session-client path that may still touch org_members
-- (e.g. via an implicit join in another table's RLS policy).

-- Step 1: Create a SECURITY DEFINER helper to check admin membership
--         without triggering org_members policy recursion.
CREATE OR REPLACE FUNCTION public.is_org_admin_or_league_admin(p_org_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE organization_id = p_org_id
      AND user_id = p_user_id
      AND role IN ('org_admin', 'league_admin')
      AND status = 'active'
  );
$$;

-- Step 2: Replace the recursive policy with one that uses the helper function.
DROP POLICY IF EXISTS "org_members_admin_all" ON public.org_members;

CREATE POLICY "org_members_admin_all" ON public.org_members
  FOR ALL USING (
    organization_id = current_org_id()
    AND is_org_admin_or_league_admin(organization_id, (SELECT auth.uid()))
  );
