-- ── Player consent ledger (PIPEDA + CASL) ─────────────────────────────────────
-- Additive: this does NOT replace waiver_signatures (which remains the
-- authoritative waiver record). It records every consent event — privacy
-- policy, waiver, and the two marketing categories — in one append-only ledger.
-- Fieldday mapping: tenant→organization, player→user (profiles), season→league.

CREATE TABLE IF NOT EXISTS public.player_consents (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id           uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id                   uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  league_id                 uuid        REFERENCES public.leagues(id) ON DELETE SET NULL,
  consent_type              text        NOT NULL
                              CHECK (consent_type IN ('privacy_policy', 'waiver', 'marketing_email', 'marketing_sms')),
  consent_given             boolean     NOT NULL,
  document_slug             text,                                    -- e.g. 'privacy'
  document_version          text,
  legal_document_version_id uuid        REFERENCES public.legal_document_versions(id),
  waiver_id                 uuid        REFERENCES public.waivers(id),
  waiver_signature_id       uuid        REFERENCES public.waiver_signatures(id),
  consented_at              timestamptz NOT NULL DEFAULT now(),
  withdrawn_at              timestamptz,
  ip_address                text,
  user_agent                text,
  created_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS player_consents_user_idx   ON public.player_consents (organization_id, user_id, consent_type);
CREATE INDEX IF NOT EXISTS player_consents_league_idx ON public.player_consents (league_id);
CREATE INDEX IF NOT EXISTS player_consents_type_idx   ON public.player_consents (organization_id, consent_type, consented_at DESC);

-- Append-only: only `withdrawn_at` may change after insert; all else immutable.
CREATE OR REPLACE FUNCTION public.player_consents_append_only()
RETURNS trigger AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.league_id IS DISTINCT FROM OLD.league_id
     OR NEW.consent_type IS DISTINCT FROM OLD.consent_type
     OR NEW.consent_given IS DISTINCT FROM OLD.consent_given
     OR NEW.document_slug IS DISTINCT FROM OLD.document_slug
     OR NEW.document_version IS DISTINCT FROM OLD.document_version
     OR NEW.legal_document_version_id IS DISTINCT FROM OLD.legal_document_version_id
     OR NEW.waiver_id IS DISTINCT FROM OLD.waiver_id
     OR NEW.waiver_signature_id IS DISTINCT FROM OLD.waiver_signature_id
     OR NEW.consented_at IS DISTINCT FROM OLD.consented_at
     OR NEW.ip_address IS DISTINCT FROM OLD.ip_address
     OR NEW.user_agent IS DISTINCT FROM OLD.user_agent
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'player_consents is append-only; only withdrawn_at may be updated';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS player_consents_no_mutate ON public.player_consents;
CREATE TRIGGER player_consents_no_mutate
  BEFORE UPDATE ON public.player_consents
  FOR EACH ROW EXECUTE FUNCTION public.player_consents_append_only();

ALTER TABLE public.player_consents ENABLE ROW LEVEL SECURITY;

-- Player reads their own; org admins read their org's; (DELETE has no policy → blocked,
-- except FK cascade on org/user deletion). Writes go through the service role.
DROP POLICY IF EXISTS "player_consents_own_read" ON public.player_consents;
CREATE POLICY "player_consents_own_read" ON public.player_consents
  FOR SELECT USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "player_consents_admin_read" ON public.player_consents;
CREATE POLICY "player_consents_admin_read" ON public.player_consents
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.organization_id = player_consents.organization_id
        AND om.user_id = (SELECT auth.uid())
        AND om.role IN ('org_admin', 'league_admin')
        AND om.status = 'active'
    )
  );

DROP POLICY IF EXISTS "player_consents_service" ON public.player_consents;
CREATE POLICY "player_consents_service" ON public.player_consents
  FOR ALL USING (auth.role() = 'service_role');

-- ── Waiver reconsent flag (extends existing waivers; non-destructive) ──────────
ALTER TABLE public.waivers
  ADD COLUMN IF NOT EXISTS requires_reconsent boolean NOT NULL DEFAULT false;
