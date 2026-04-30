-- Backfill league_id on waiver_signatures from registrations
-- Fixes historical signatures that were created before the league_id column was added (migration 025)
-- Also fixes signatures that were re-used for a second event (the unique(user_id,waiver_id) path in signWaiver)
-- where league_id was not updated because the existing signature was returned as-is.

UPDATE public.waiver_signatures ws
SET league_id = r.league_id
FROM public.registrations r
WHERE r.waiver_signature_id = ws.id
  AND ws.league_id IS NULL
  AND r.league_id IS NOT NULL;
