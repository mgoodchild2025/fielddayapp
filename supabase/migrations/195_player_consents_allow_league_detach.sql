-- Auto-purge of soft-deleted events has been failing forever on any event that
-- collected a consent:
--
--   "player_consents is append-only; only withdrawn_at may be updated"
--
-- player_consents.league_id references leagues(id) ON DELETE SET NULL, so
-- deleting a league makes Postgres UPDATE the consent row to null that column.
-- The append-only trigger (migration 134) treated that as a forbidden mutation
-- and aborted the whole delete, so the league stayed in the trash and the cron
-- retried it every run.
--
-- Allow exactly that one transition: league_id may become NULL (the FK
-- detaching a purged event) but may never be repointed at a DIFFERENT league.
-- The consent row itself survives, which is the point of the ledger — the
-- evidence has to outlive the event it was collected for.

CREATE OR REPLACE FUNCTION public.player_consents_append_only()
RETURNS trigger AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     -- league_id: NULL-ing is allowed (FK ON DELETE SET NULL on event purge);
     -- any other change is still a forbidden mutation.
     OR (NEW.league_id IS DISTINCT FROM OLD.league_id AND NEW.league_id IS NOT NULL)
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
