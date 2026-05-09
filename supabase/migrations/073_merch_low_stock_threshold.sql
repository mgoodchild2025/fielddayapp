-- Add a configurable low-stock threshold to merchandise items.
-- When available stock (per-item or per-variant) drops to or below this value,
-- the admin UI highlights the item and a notification is sent to org admins.
-- Default of 5 is a sensible starting point for most sports orgs.
ALTER TABLE public.merchandise_items
  ADD COLUMN IF NOT EXISTS low_stock_threshold integer NOT NULL DEFAULT 5;
