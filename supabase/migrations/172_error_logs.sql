-- Server-side error log — populated by instrumentation.ts (onRequestError).
-- Gives production errors a home instead of vanishing into container stdout.
-- Viewed at /super/errors; alert emails are throttled per digest.

CREATE TABLE IF NOT EXISTS public.error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Stable hash of message + top stack frames: groups repeats of the same error
  digest text NOT NULL,
  message text NOT NULL,
  stack text,
  -- Request context
  path text,
  method text,
  -- 'render' | 'route' | 'action' | 'middleware' etc. (from Next's context)
  router_kind text,
  organization_id uuid,
  user_agent text
);

CREATE INDEX IF NOT EXISTS error_logs_digest_created_idx
  ON public.error_logs (digest, created_at DESC);
CREATE INDEX IF NOT EXISTS error_logs_created_idx
  ON public.error_logs (created_at DESC);

-- Service-role only (no client access): enable RLS with no policies.
ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;
