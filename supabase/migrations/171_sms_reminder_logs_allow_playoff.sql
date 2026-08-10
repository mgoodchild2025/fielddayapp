-- Allow SMS reminder dedup rows for playoff bracket matches (whose ids live in
-- bracket_matches, not games). The (game_id, minutes_before) primary key stays
-- as the dedup key; we just drop the FK so the id can be a games.id OR a
-- bracket_matches.id. Orphan dedup rows after a delete are harmless.
ALTER TABLE public.game_sms_reminder_logs
  DROP CONSTRAINT IF EXISTS game_sms_reminder_logs_game_id_fkey;
