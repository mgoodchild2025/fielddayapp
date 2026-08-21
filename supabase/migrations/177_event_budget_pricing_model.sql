-- Pricing planner: plan against either billing model.
--
-- The planner used to derive its recommendation from the event's CURRENT
-- payment_mode, so an admin could not ask "what would this event cost per team
-- instead of per player?" without changing the live event first. The planning
-- model is now the planner's own setting, saved with the rest of the worksheet.
--
-- Nullable on purpose: null means "follow the event's billing model", which is
-- what every worksheet saved before this migration was doing implicitly.

ALTER TABLE public.event_budgets
  ADD COLUMN IF NOT EXISTS pricing_model text
    CHECK (pricing_model IN ('per_player', 'per_team'));

COMMENT ON COLUMN public.event_budgets.pricing_model IS
  'Billing model the recommendation is calculated for. Null = follow the league''s payment_mode.';
