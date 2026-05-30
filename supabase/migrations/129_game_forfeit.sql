-- Forfeit support on game results
ALTER TABLE public.game_results
  ADD COLUMN IF NOT EXISTS is_forfeit      boolean NOT NULL DEFAULT false,
  -- the team that forfeited; NULL with is_forfeit=true means a double forfeit
  ADD COLUMN IF NOT EXISTS forfeit_team_id uuid REFERENCES public.teams(id);
