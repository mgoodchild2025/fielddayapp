ALTER TABLE public.roster_notes
  ADD COLUMN IF NOT EXISTS invite_role text NOT NULL DEFAULT 'player'
    CHECK (invite_role IN ('player', 'sub', 'captain', 'coach'));
