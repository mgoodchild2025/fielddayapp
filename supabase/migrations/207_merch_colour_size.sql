-- Colour × size options for merchandise (e.g. T-shirts in three colours).
-- Each combination stays one merchandise_variants row with its own stock and
-- label ("Black / M"), so orders, carts and emails are unchanged; colour/size
-- only tell the shop to show two pickers. Both null = a plain option.
ALTER TABLE public.merchandise_variants
  ADD COLUMN IF NOT EXISTS colour text,
  ADD COLUMN IF NOT EXISTS size   text;

-- Optional photo per colour: { "Black": "<one of the item's image urls>" }.
ALTER TABLE public.merchandise_items
  ADD COLUMN IF NOT EXISTS colour_images jsonb;
