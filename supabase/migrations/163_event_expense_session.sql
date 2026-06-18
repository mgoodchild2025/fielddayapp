-- 163_event_expense_session.sql
-- Drop-in / pickup events run as a series of sessions, and many costs (court
-- rental, refs, staff) are incurred per session. Allow an expense to be
-- attributed to a specific session. Nullable — whole-event expenses keep it null.

ALTER TABLE public.event_expenses
  ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES public.event_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS event_expenses_session_idx ON public.event_expenses (session_id);
