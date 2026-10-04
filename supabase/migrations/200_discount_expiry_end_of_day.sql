-- Discount codes saved before batch K stored the admin's date-only "Expires
-- At" (e.g. 2026-10-31) as midnight UTC — 8pm the evening BEFORE in Toronto —
-- so codes stopped working a day early. New saves store the end of that day in
-- the org's timezone (actions/discounts.ts → endOfDayInOrg).
--
-- Move existing midnight-UTC expiries to the end of the same calendar day in
-- each org's timezone (falling back to America/Toronto). Idempotent: rows that
-- were already converted no longer sit at exactly 00:00 UTC.

UPDATE public.discount_codes AS d
SET expires_at = (
  ((d.expires_at AT TIME ZONE 'UTC')::date + time '23:59:59.999')
  AT TIME ZONE COALESCE(
    (SELECT b.timezone FROM public.org_branding b WHERE b.organization_id = d.organization_id),
    'America/Toronto'
  )
)
WHERE d.expires_at IS NOT NULL
  AND (d.expires_at AT TIME ZONE 'UTC')::time = time '00:00:00';
