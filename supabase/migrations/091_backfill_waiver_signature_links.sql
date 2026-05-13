-- Migration 091: Backfill waiver_signature_id on registrations
--
-- During the period when the app was using the session client for all DB
-- queries, RLS on the registrations table prevented the UPDATE that links
-- a waiver_signatures row to a registration after signing. This left
-- registrations.waiver_signature_id = NULL even when a waiver_signatures
-- row exists for the same user + league.
--
-- Also, a bug in signWaiver (immutable query builder) caused the league_id
-- filter on the duplicate-check to be silently dropped, so signatures from
-- one event were sometimes reused for another event without creating a new
-- row. This migration links any orphaned signature rows to their matching
-- registrations.
--
-- Safe to run multiple times (only updates rows where waiver_signature_id IS NULL).

UPDATE public.registrations r
SET waiver_signature_id = ws.id
FROM public.waiver_signatures ws
WHERE r.waiver_signature_id IS NULL
  AND ws.user_id          = r.user_id
  AND ws.organization_id  = r.organization_id
  AND ws.league_id        = r.league_id
  AND r.status IN ('pending', 'active');
