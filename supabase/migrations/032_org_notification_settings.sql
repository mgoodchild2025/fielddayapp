-- Per-org notification settings (SMS game reminders, etc.)
CREATE TABLE IF NOT EXISTS public.org_notification_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  sms_game_reminders_enabled boolean NOT NULL DEFAULT true,
  sms_reminder_hours_before integer NOT NULL DEFAULT 3,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.org_notification_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notif_settings_org_read" ON public.org_notification_settings;
CREATE POLICY "notif_settings_org_read" ON public.org_notification_settings
  FOR SELECT USING (organization_id = current_org_id());

DROP POLICY IF EXISTS "notif_settings_admin_write" ON public.org_notification_settings;
CREATE POLICY "notif_settings_admin_write" ON public.org_notification_settings
  FOR ALL USING (
    organization_id = current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.organization_id = current_org_id()
        AND org_members.user_id = auth.uid()
        AND org_members.role = 'org_admin'
    )
  );

DROP POLICY IF EXISTS "notif_settings_service_all" ON public.org_notification_settings;
CREATE POLICY "notif_settings_service_all" ON public.org_notification_settings
  FOR ALL USING (auth.role() = 'service_role');
