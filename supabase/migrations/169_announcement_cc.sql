-- 169_announcement_cc.sql
-- Persist the "send me a copy" (cc_self) and cc_admins intent on announcements
-- so the scheduled (cron) delivery path can honour them — the immediate path
-- passes them in memory, but a scheduled send is delivered later by the cron,
-- which only has the stored row to work from. Apply manually via the SQL editor.

ALTER TABLE announcements
  ADD COLUMN IF NOT EXISTS cc_self   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cc_admins boolean NOT NULL DEFAULT false;
