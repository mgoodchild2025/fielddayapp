-- Tag each announcement as transactional (operational, sent to all) or
-- commercial (promotional, gated by CASL marketing consent).
ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS message_class text NOT NULL DEFAULT 'transactional'
    CHECK (message_class IN ('transactional', 'commercial'));
