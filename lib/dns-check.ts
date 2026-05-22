import type { RailwayDnsRecord } from '@/lib/railway'

/**
 * Look up a CNAME record via Cloudflare's public DNS-over-HTTPS API.
 * Using DoH avoids relying on the Railway container's internal resolver,
 * which can't see public DNS the same way nslookup from outside does.
 */
export async function resolveCnameViaDoH(host: string): Promise<string[]> {
  try {
    const res = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=CNAME`,
      { headers: { Accept: 'application/dns-json' }, signal: AbortSignal.timeout(5000) }
    )
    if (!res.ok) return []
    const json = await res.json() as { Answer?: Array<{ type: number; data: string }> }
    // DNS type 5 = CNAME
    return (json.Answer ?? []).filter(r => r.type === 5).map(r => r.data)
  } catch {
    return []
  }
}

/**
 * Look up TXT records via Cloudflare's public DNS-over-HTTPS API.
 * Returns all TXT record values for the given host.
 */
export async function resolveTxtViaDoH(host: string): Promise<string[]> {
  try {
    const res = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=TXT`,
      { headers: { Accept: 'application/dns-json' }, signal: AbortSignal.timeout(5000) }
    )
    if (!res.ok) return []
    const json = await res.json() as { Answer?: Array<{ type: number; data: string }> }
    // DNS type 16 = TXT; Cloudflare wraps the value in quotes — strip them
    return (json.Answer ?? [])
      .filter(r => r.type === 16)
      .map(r => r.data.replace(/^"|"$/g, '').trim())
  } catch {
    return []
  }
}

/**
 * Check each DNS record against public DNS and override PENDING → VALID
 * when the record resolves to the expected Railway target.
 *
 * Handles both CNAME and TXT records. Railway's hostlabel can be just the
 * subdomain label ("www") or a full FQDN ("www.example.com"). We try both
 * so it works either way.
 */
export async function verifyCnameRecords(
  records: RailwayDnsRecord[],
  customDomain?: string,
): Promise<RailwayDnsRecord[]> {
  const normalize = (v: string) => v.replace(/\.$/, '').toLowerCase()

  return Promise.all(records.map(async (record) => {
    if (record.status === 'VALID') return record

    const { hostlabel, requiredValue, recordType } = record
    const expected = normalize(requiredValue)

    // Try multiple candidates in case hostlabel is a label ("www") not a FQDN
    const candidates = new Set<string>([hostlabel])
    if (customDomain) {
      if (!hostlabel.endsWith(customDomain)) candidates.add(`${hostlabel}.${customDomain}`)
      candidates.add(customDomain)
    }

    if (recordType === 'CNAME') {
      for (const candidate of candidates) {
        const resolved = await resolveCnameViaDoH(candidate)
        console.log(`[dns-check] CNAME lookup "${candidate}" → [${resolved.join(', ')}] (expected: "${expected}")`)
        if (resolved.some(v => normalize(v) === expected)) {
          console.log(`[dns-check] ✓ CNAME VALID match on "${candidate}"`)
          return { ...record, status: 'VALID' as const }
        }
      }
      console.log(`[dns-check] ✗ CNAME no match — hostlabel="${hostlabel}" requiredValue="${requiredValue}" customDomain="${customDomain}"`)
    }

    if (recordType === 'TXT') {
      for (const candidate of candidates) {
        const resolved = await resolveTxtViaDoH(candidate)
        console.log(`[dns-check] TXT lookup "${candidate}" → [${resolved.join(', ')}] (expected: "${expected}")`)
        if (resolved.some(v => normalize(v) === expected)) {
          console.log(`[dns-check] ✓ TXT VALID match on "${candidate}"`)
          return { ...record, status: 'VALID' as const }
        }
      }
      console.log(`[dns-check] ✗ TXT no match — hostlabel="${hostlabel}" requiredValue="${requiredValue}" customDomain="${customDomain}"`)
    }

    return record
  }))
}
