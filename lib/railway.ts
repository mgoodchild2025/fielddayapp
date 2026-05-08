/**
 * Railway API helpers for managing custom domains on the Fieldday service.
 *
 * Railway must know about a domain before it provisions a TLS certificate for it.
 * These functions are called from the branding server action whenever an org
 * adds, changes, or removes their custom domain.
 *
 * Required env vars (server-only):
 *   RAILWAY_API_TOKEN        — found in Railway → Account Settings → Tokens
 *   RAILWAY_SERVICE_ID       — found in Railway → project → service → Settings → General
 *   RAILWAY_ENVIRONMENT_ID   — found in Railway → project → Settings → Environments (the production env ID)
 */

const RAILWAY_API = 'https://backboard.railway.app/graphql/v2'

function getConfig(): { token: string; serviceId: string; environmentId: string } | null {
  const token = process.env.RAILWAY_API_TOKEN
  const serviceId = process.env.RAILWAY_SERVICE_ID
  const environmentId = process.env.RAILWAY_ENVIRONMENT_ID

  if (!token || !serviceId || !environmentId) {
    // Not configured — caller should fall back to manual instructions
    return null
  }
  return { token, serviceId, environmentId }
}

async function graphql<T>(
  token: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<T | null> {
  try {
    const res = await fetch(RAILWAY_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query, variables }),
    })

    if (!res.ok) {
      console.error('[railway] HTTP error:', res.status, await res.text())
      return null
    }

    const json = await res.json()
    if (json.errors?.length) {
      console.error('[railway] GraphQL errors:', JSON.stringify(json.errors))
      return null
    }

    return json.data as T
  } catch (err) {
    console.error('[railway] fetch error:', err)
    return null
  }
}

export interface RailwayDomainResult {
  /** Railway's internal ID for the custom domain (needed for future deletion) */
  id: string
  domain: string
  /** The CNAME target the org must point their DNS to, e.g. fieldday.up.railway.app */
  cnameTarget: string | null
}

/**
 * Register a custom domain with the Railway service.
 * Returns the domain record on success, or null if Railway is not configured / the call fails.
 */
export async function addRailwayCustomDomain(domain: string): Promise<RailwayDomainResult | null> {
  const cfg = getConfig()
  if (!cfg) return null

  const data = await graphql<{
    customDomainCreate: {
      id: string
      domain: string
      status: { cname: string | null } | null
    }
  }>(
    cfg.token,
    `mutation AddCustomDomain($input: CustomDomainCreateInput!) {
      customDomainCreate(input: $input) {
        id
        domain
        status { cname }
      }
    }`,
    {
      input: {
        domain,
        serviceId: cfg.serviceId,
        environmentId: cfg.environmentId,
      },
    },
  )

  if (!data?.customDomainCreate) return null

  return {
    id: data.customDomainCreate.id,
    domain: data.customDomainCreate.domain,
    cnameTarget: data.customDomainCreate.status?.cname ?? null,
  }
}

/**
 * Remove a custom domain from the Railway service.
 * Pass the Railway domain ID that was stored when the domain was first added.
 */
export async function removeRailwayCustomDomain(railwayDomainId: string): Promise<boolean> {
  const cfg = getConfig()
  if (!cfg) return false

  const data = await graphql<{ customDomainDelete: boolean }>(
    cfg.token,
    `mutation RemoveCustomDomain($id: String!) {
      customDomainDelete(id: $id)
    }`,
    { id: railwayDomainId },
  )

  return data?.customDomainDelete === true
}

/** Returns true if Railway API env vars are configured. */
export function isRailwayConfigured(): boolean {
  return !!(
    process.env.RAILWAY_API_TOKEN &&
    process.env.RAILWAY_SERVICE_ID &&
    process.env.RAILWAY_ENVIRONMENT_ID
  )
}
