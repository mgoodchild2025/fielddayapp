-- Add game-day SMS preference to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS sms_game_day_enabled boolean NOT NULL DEFAULT true;

-- Log table: one row per player per org per date prevents duplicate game-day SMS
CREATE TABLE IF NOT EXISTS player_game_day_sms_logs (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid     NOT NULL,
  log_date     date        NOT NULL,
  sent_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, organization_id, log_date)
);

-- Players can read/insert their own logs; service role does everything
ALTER TABLE player_game_day_sms_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_game_day_logs" ON player_game_day_sms_logs;
CREATE POLICY "own_game_day_logs" ON player_game_day_sms_logs
  FOR SELECT USING (auth.uid() = user_id);
