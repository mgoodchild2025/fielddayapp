-- Previously waiver_signatures had UNIQUE(user_id, waiver_id), meaning one
-- signature was shared across every event that used the same waiver version.
-- This caused all registrations to show the same signed_at timestamp, and
-- made it impossible to track a distinct signed contract per event.
--
-- The new constraint UNIQUE(user_id, waiver_id, league_id) allows one
-- signature per player per waiver per event. NULLs in league_id are distinct
-- (SQL semantics), which is fine for any legacy rows without a league.

ALTER TABLE public.waiver_signatures
  DROP CONSTRAINT IF EXISTS waiver_signatures_user_id_waiver_id_key;

ALTER TABLE public.waiver_signatures
  ADD CONSTRAINT waiver_signatures_user_id_waiver_id_league_id_key
  UNIQUE (user_id, waiver_id, league_id);
