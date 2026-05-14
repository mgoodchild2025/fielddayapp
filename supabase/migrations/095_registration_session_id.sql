-- Link drop-in registrations to a specific event session
ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES public.event_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS registrations_session_id_idx
  ON public.registrations (session_id)
  WHERE session_id IS NOT NULL;
