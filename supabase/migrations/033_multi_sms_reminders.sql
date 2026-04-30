-- Replace single-timing SMS reminders with per-org multi-reminder configs

-- Individual reminder configs per org (replaces sms_reminder_hours_before column)
CREATE TABLE IF NOT EXISTS public.org_sms_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  minutes_before integer NOT NULL,
  message_template text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, minutes_before)
);

ALTER TABLE public.org_sms_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sms_reminders_org_read" ON public.org_sms_reminders;
CREATE POLICY "sms_reminders_org_read" ON public.org_sms_reminders
  FOR SELECT USING (organization_id = current_org_id());

DROP POLICY IF EXISTS "sms_reminders_admin_write" ON public.org_sms_reminders;
CREATE POLICY "sms_reminders_admin_write" ON public.org_sms_reminders
  FOR ALL USING (
    organization_id = current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.organization_id = current_org_id()
        AND org_members.user_id = auth.uid()
        AND org_members.role = 'org_admin'
    )
  );

DROP POLICY IF EXISTS "sms_reminders_service_all" ON public.org_sms_reminders;
CREATE POLICY "sms_reminders_service_all" ON public.org_sms_reminders
  FOR ALL USING (auth.role() = 'service_role');

-- Tracks which (game, minutes_before) combos have already been sent
-- Replaces the single sms_reminder_sent column on games for the multi-reminder system
CREATE TABLE IF NOT EXISTS public.game_sms_reminder_logs (
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  minutes_before integer NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (game_id, minutes_before)
);

ALTER TABLE public.game_sms_reminder_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sms_reminder_logs_service_all" ON public.game_sms_reminder_logs;
CREATE POLICY "sms_reminder_logs_service_all" ON public.game_sms_reminder_logs
  FOR ALL USING (auth.role() = 'service_role');

-- Remove the old single-value column from org_notification_settings
ALTER TABLE public.org_notification_settings
  DROP COLUMN IF EXISTS sms_reminder_hours_before;
