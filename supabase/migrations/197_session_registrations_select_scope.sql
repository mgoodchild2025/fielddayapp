-- Tenant isolation fix: session_registrations was world-readable.
--
-- 015_sessions.sql created the SELECT policy as `using (true)` with the comment
-- "users can read all (to see who's in a session)". There is no TO clause, so
-- it applied to anon as well as authenticated. 087 and 088 later rewrote the
-- INSERT, UPDATE and admin policies on this table and left the SELECT one
-- untouched, so the drift was never caught. The practical effect: anyone could
-- enumerate every organization's drop-in signups, including user ids.
--
-- Safe to tighten: every read of this table in the application goes through the
-- service-role client (public schedule, public event page, register flow, admin
-- sessions, admin check-in), which bypasses RLS. This policy governs only
-- direct PostgREST access with an anon or user key.
--
-- Org admins keep full access through the existing "session_reg_admin" policy
-- (FOR ALL), so this only needs to cover a user reading their own rows.

DROP POLICY IF EXISTS "session_reg_select" ON public.session_registrations;

CREATE POLICY "session_reg_select" ON public.session_registrations
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));
