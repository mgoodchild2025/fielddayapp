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
 * Check each CNAME record against public DNS and override PENDING → VALID
 * when the record resolves to the expected Railway target.
 *
 * Railway's hostlabel can be just the subdomain label ("www") or a full FQDN
 * ("www.example.com"). We try both so it works either way.
 */
export async function verifyCnameRecords(
  records: RailwayDnsRecord[],
  customDomain?: string,
): Promise<RailwayDnsRecord[]> {
  const normalize = (v: string) => v.replace(/\.$/, '').toLowerCase()

  return Promise.all(records.map(async (record) => {
    if (record.recordType !== 'CNAME' || record.status === 'VALID') return record

    const { hostlabel, requiredValue } = record
    const expected = normalize(requiredValue)

    // Try multiple candidates in case hostlabel is a label ("www") not a FQDN
    const candidates = new Set<string>([hostlabel])
    if (customDomain) {
      if (!hostlabel.endsWith(customDomain)) candidates.add(`${hostlabel}.${customDomain}`)
      candidates.add(customDomain)
    }

    for (const candidate of candidates) {
      const resolved = await resolveCnameViaDoH(candidate)
      console.log(`[dns-check] CNAME lookup "${candidate}" → [${resolved.join(', ')}] (expected: "${expected}")`)
      if (resolved.some(v => normalize(v) === expected)) {
        console.log(`[dns-check] ✓ VALID match on "${candidate}"`)
        return { ...record, status: 'VALID' as const }
      }
    }

    console.log(`[dns-check] ✗ no match — hostlabel="${hostlabel}" requiredValue="${requiredValue}" customDomain="${customDomain}"`)
    return record
  }))
}
