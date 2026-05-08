/**
 * Railway API helpers for managing custom domains on the Fieldday service.
 *
 * Railway must know about a domain before it provisions a TLS certificate for it.
 * These functions are called from the branding server action whenever an org
 * adds, changes, or removes their custom domain.
 *
 * Required env vars (server-only):
 *   RAILWAY_API_TOKEN  — Railway dashboard → Account Settings (avatar) → Tokens → Create token
 *
 * Railway automatically injects RAILWAY_SERVICE_ID and RAILWAY_ENVIRONMENT_ID at runtime —
 * do NOT set these manually; they are already present in every Railway service.
 */

const RAILWAY_API = 'https://backboard.railway.app/graphql/v2'

function getConfig(): { token: string; projectId: string; serviceId: string; environmentId: string } | null {
  const token = process.env.RAILWAY_API_TOKEN
  const projectId = process.env.RAILWAY_PROJECT_ID       // auto-injected by Railway
  const serviceId = process.env.RAILWAY_SERVICE_ID       // auto-injected by Railway
  const environmentId = process.env.RAILWAY_ENVIRONMENT_ID // auto-injected by Railway

  if (!token || !projectId || !serviceId || !environmentId) {
    // Not fully configured — caller should fall back to manual instructions
    return null
  }
  return { token, projectId, serviceId, environmentId }
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

    const text = await res.text()

    if (!res.ok) {
      console.error('[railway] HTTP error:', res.status, text)
      return null
    }

    let json: { data?: T; errors?: { message: string }[] }
    try {
      json = JSON.parse(text)
    } catch {
      console.error('[railway] non-JSON response:', text)
      return null
    }

    if (json.errors?.length) {
      console.error('[railway] GraphQL errors:', JSON.stringify(json.errors))
      return null
    }

    return json.data ?? null
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
      syncStatus: string | null
    }
  }>(
    cfg.token,
    `mutation AddCustomDomain($input: CustomDomainCreateInput!) {
      customDomainCreate(input: $input) {
        id
        domain
        syncStatus
      }
    }`,
    {
      input: {
        domain,
        projectId: cfg.projectId,
        serviceId: cfg.serviceId,
        environmentId: cfg.environmentId,
      },
    },
  )

  if (!data?.customDomainCreate) return null

  // Fetch the CNAME target from the status query now that we have the domain ID
  const cnameTarget = await fetchCnameTarget(cfg.token, data.customDomainCreate.id, cfg.projectId)

  return {
    id: data.customDomainCreate.id,
    domain: data.customDomainCreate.domain,
    cnameTarget,
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

/**
 * Fetch the CNAME target value for a custom domain after it has been created.
 * Railway returns this via a separate status query.
 */
async function fetchCnameTarget(
  token: string,
  domainId: string,
  projectId: string,
): Promise<string | null> {
  const data = await graphql<{
    customDomain: {
      status: {
        dnsRecords: Array<{ hostlabel: string; requiredValue: string; status: string }>
      } | null
    }
  }>(
    token,
    `query GetCustomDomainStatus($id: String!, $projectId: String!) {
      customDomain(id: $id, projectId: $projectId) {
        status {
          dnsRecords {
            hostlabel
            requiredValue
            status
          }
        }
      }
    }`,
    { id: domainId, projectId },
  )

  // The CNAME record is the one that is not a TXT record (requiredValue starts with a hostname)
  const records = data?.customDomain?.status?.dnsRecords ?? []
  const cname = records.find((r) => !r.requiredValue.startsWith('railway-verify='))
  return cname?.requiredValue ?? null
}

/** Returns true if Railway API env vars are configured. */
export function isRailwayConfigured(): boolean {
  return !!(
    process.env.RAILWAY_API_TOKEN &&
    process.env.RAILWAY_PROJECT_ID &&
    process.env.RAILWAY_SERVICE_ID &&
    process.env.RAILWAY_ENVIRONMENT_ID
  )
}
