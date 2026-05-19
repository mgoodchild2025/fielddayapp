-- Support multiple product images per merchandise item
ALTER TABLE public.merchandise_items
  ADD COLUMN IF NOT EXISTS additional_images jsonb NOT NULL DEFAULT '[]'::jsonb;
