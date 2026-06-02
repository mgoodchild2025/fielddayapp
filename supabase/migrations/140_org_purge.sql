-- Allow a deliberate organization purge to cascade-delete its append-only
-- tenant_acceptances rows, while keeping them append-only for all other ops.
--
-- The trigger now permits DELETE only when a transaction-local flag
-- (app.purge_org) is set — which only the purge_organization() RPC does.

CREATE OR REPLACE FUNCTION public.prevent_acceptance_mutation()
RETURNS trigger AS $$
BEGIN
  -- Permit deletion only during a sanctioned org purge.
  IF TG_OP = 'DELETE' AND current_setting('app.purge_org', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Tenant acceptance records are append-only and cannot be modified or deleted';
END;
$$ LANGUAGE plpgsql;

-- Atomic org purge: set the transaction-local flag, then delete the org so the
-- ON DELETE CASCADE removes child rows (incl. tenant_acceptances) in the same tx.
CREATE OR REPLACE FUNCTION public.purge_organization(p_org_id uuid)
RETURNS void AS $$
BEGIN
  PERFORM set_config('app.purge_org', 'on', true);  -- true = local to this tx
  DELETE FROM public.organizations WHERE id = p_org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.purge_organization(uuid) TO service_role;
