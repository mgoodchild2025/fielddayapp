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
 * Railway automatically injects RAILWAY_PROJECT_ID, RAILWAY_SERVICE_ID and
 * RAILWAY_ENVIRONMENT_ID at runtime — do NOT set these manually.
 */

const RAILWAY_API = 'https://backboard.railway.app/graphql/v2'

function getConfig(): { token: string; projectId: string; serviceId: string; environmentId: string } | null {
  const token = process.env.RAILWAY_API_TOKEN
  const projectId = process.env.RAILWAY_PROJECT_ID       // auto-injected by Railway
  const serviceId = process.env.RAILWAY_SERVICE_ID       // auto-injected by Railway
  const environmentId = process.env.RAILWAY_ENVIRONMENT_ID // auto-injected by Railway

  if (!token || !projectId || !serviceId || !environmentId) return null
  return { token, projectId, serviceId, environmentId }
}

async function gql<T>(
  token: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<{ data: T | null; errors: string[] }> {
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
      return { data: null, errors: [`HTTP ${res.status}`] }
    }

    let json: { data?: T; errors?: { message: string }[] }
    try { json = JSON.parse(text) } catch {
      console.error('[railway] non-JSON response:', text)
      return { data: null, errors: ['non-JSON response'] }
    }

    const errors = json.errors?.map((e) => e.message) ?? []
    if (errors.length) {
      console.error('[railway] GraphQL errors:', JSON.stringify(json.errors))
    }

    return { data: json.data ?? null, errors }
  } catch (err) {
    console.error('[railway] fetch error:', err)
    return { data: null, errors: [String(err)] }
  }
}

// ── Public types ──────────────────────────────────────────────────────────────

export interface RailwayDnsRecord {
  /** The DNS label to configure, e.g. "www" or "_railway.www" */
  hostlabel: string
  /** The value to set, e.g. "abc.up.railway.app" or "railway-verify=xyz" */
  requiredValue: string
  /** CNAME for routing; TXT for domain verification */
  recordType: 'CNAME' | 'TXT'
  /** Whether this record has been detected by Railway */
  status: 'PENDING' | 'VALID' | 'INVALID'
}

export interface RailwayDomainResult {
  /** Railway's internal ID — needed for deletion */
  id: string
  domain: string
  dnsRecords: RailwayDnsRecord[]
}

// ── Domain list query — used to recover an existing domain ID ─────────────────

const LIST_DOMAINS_QUERY = `
  query ListServiceDomains($projectId: String!, $serviceId: String!, $environmentId: String!) {
    domains(projectId: $projectId, serviceId: $serviceId, environmentId: $environmentId) {
      customDomains {
        id
        domain
      }
    }
  }
`

type ListDomainsResponse = {
  domains: {
    customDomains: Array<{ id: string; domain: string }>
  }
}

async function findExistingDomainId(
  token: string,
  projectId: string,
  serviceId: string,
  environmentId: string,
  targetDomain: string,
): Promise<string | null> {
  const { data } = await gql<ListDomainsResponse>(token, LIST_DOMAINS_QUERY, {
    projectId,
    serviceId,
    environmentId,
  })
  const match = data?.domains?.customDomains?.find(
    (d) => d.domain.toLowerCase() === targetDomain.toLowerCase(),
  )
  return match?.id ?? null
}

// ── DNS record query (shared by create and refresh) ───────────────────────────

const DNS_STATUS_QUERY = `
  query GetCustomDomainStatus($id: String!, $projectId: String!) {
    customDomain(id: $id, projectId: $projectId) {
      id
      domain
      status {
        dnsRecords {
          hostlabel
          requiredValue
          status
        }
      }
    }
  }
`

type DnsStatusResponse = {
  customDomain: {
    id: string
    domain: string
    status: {
      dnsRecords: Array<{ hostlabel: string; requiredValue: string; status: string }>
    } | null
  }
}

function parseDnsRecords(
  raw: Array<{ hostlabel: string; requiredValue: string; status: string }>,
): RailwayDnsRecord[] {
  return raw.map((r) => ({
    hostlabel: r.hostlabel,
    requiredValue: r.requiredValue,
    recordType: r.requiredValue.startsWith('railway-verify=') ? 'TXT' : 'CNAME',
    status: (['PENDING', 'VALID', 'INVALID'].includes(r.status) ? r.status : 'PENDING') as RailwayDnsRecord['status'],
  }))
}

// ── Exported functions ────────────────────────────────────────────────────────

/**
 * Register a custom domain with the Railway service and return the DNS records
 * the org admin must create at their registrar.
 */
export async function addRailwayCustomDomain(domain: string): Promise<RailwayDomainResult | null> {
  const cfg = getConfig()
  if (!cfg) return null

  // Step 1 — create the domain
  const { data: created, errors } = await gql<{ customDomainCreate: { id: string; domain: string } }>(
    cfg.token,
    `mutation AddCustomDomain($input: CustomDomainCreateInput!) {
      customDomainCreate(input: $input) { id domain }
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

  let domainId: string | null = created?.customDomainCreate?.id ?? null

  // If creation failed because the domain already exists in Railway, recover its ID
  // by listing all domains for this service rather than treating it as a hard error.
  if (!domainId && errors.some((e) => /already|exist/i.test(e))) {
    console.log('[railway] domain already exists — looking up existing ID for:', domain)
    domainId = await findExistingDomainId(
      cfg.token, cfg.projectId, cfg.serviceId, cfg.environmentId, domain,
    )
  }

  if (!domainId) return null

  // Step 2 — fetch the required DNS records
  const dnsRecords = await fetchDnsRecords(cfg.token, domainId, cfg.projectId)

  return { id: domainId, domain, dnsRecords }
}

/**
 * Remove a custom domain from the Railway service.
 * Pass the Railway domain ID stored in org_branding.railway_domain_id.
 */
export async function removeRailwayCustomDomain(railwayDomainId: string): Promise<boolean> {
  const cfg = getConfig()
  if (!cfg) return false

  const { data } = await gql<{ customDomainDelete: boolean }>(
    cfg.token,
    `mutation RemoveCustomDomain($id: String!) { customDomainDelete(id: $id) }`,
    { id: railwayDomainId },
  )

  return data?.customDomainDelete === true
}

/**
 * Refresh the DNS record status for a custom domain already registered with Railway.
 * Returns null if Railway is not configured or the domain ID is unknown.
 */
export async function getRailwayDomainStatus(railwayDomainId: string): Promise<RailwayDnsRecord[] | null> {
  const cfg = getConfig()
  if (!cfg) return null
  return fetchDnsRecords(cfg.token, railwayDomainId, cfg.projectId)
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

// ── Internal helpers ──────────────────────────────────────────────────────────

async function fetchDnsRecords(
  token: string,
  domainId: string,
  projectId: string,
): Promise<RailwayDnsRecord[]> {
  const { data } = await gql<DnsStatusResponse>(token, DNS_STATUS_QUERY, { id: domainId, projectId })
  const raw = data?.customDomain?.status?.dnsRecords ?? []
  return parseDnsRecords(raw)
}
