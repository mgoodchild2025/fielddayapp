-- Migration 204: who entered a playoff bracket score
-- game_results already keeps submitted_by / confirmed_by; bracket matches had
-- no record of who scored them. Set by recordBracketScore and
-- declareMatchWinner, cleared by clearBracketMatchResult.

alter table public.bracket_matches
  add column if not exists scored_by uuid references public.profiles(id) on delete set null,
  add column if not exists scored_at timestamptz;
