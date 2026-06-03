'use client'

import { useState, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  setShowOrgSponsors, linkOrgSponsor, addEventOnlySponsor, removeEventSponsor,
  uploadEventSponsorAd, removeEventSponsorAd,
  type EventSponsorRow, type OrgSponsorOption, type SponsorTier, type SponsorStat,
} from '@/actions/event-sponsors'

const TIERS: SponsorTier[] = ['gold', 'silver', 'bronze', 'standard']

interface Props {
  leagueId: string
  showOrgSponsors: boolean
  links: EventSponsorRow[]
  orgSponsors: OrgSponsorOption[]
  linkedSponsorIds: string[]
  stats: SponsorStat[]
}

export function EventSponsorManager({ leagueId, showOrgSponsors, links, orgSponsors, linkedSponsorIds, stats }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  const linkedSet = new Set(linkedSponsorIds)
  const linkable = orgSponsors.filter((s) => !linkedSet.has(s.id))

  function run(fn: () => Promise<{ error: string | null }>) {
    setError(null)
    start(async () => {
      const res = await fn()
      if (res.error) setError(res.error)
      else router.refresh()
    })
  }

  function uploadAd(id: string, file: File) {
    setError(null)
    const fd = new FormData()
    fd.set('ad', file)
    start(async () => {
      const res = await uploadEventSponsorAd(id, leagueId, fd)
      if (res.error) setError(res.error)
      else router.refresh()
    })
  }

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    fd.set('leagueId', leagueId)
    start(async () => {
      const res = await addEventOnlySponsor(fd)
      if (res.error) setError(res.error)
      else { formRef.current?.reset(); setAdding(false); router.refresh() }
    })
  }

  return (
    <div className="space-y-6">
      {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-700">{error}</div>}

      {/* Org sponsors toggle */}
      <label className="flex items-start gap-3 rounded-lg border bg-white p-4 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={showOrgSponsors}
          disabled={pending}
          onChange={(e) => run(() => setShowOrgSponsors(leagueId, e.target.checked))}
          className="mt-0.5 rounded accent-[var(--brand-primary)]"
        />
        <div>
          <p className="text-sm font-medium text-gray-900">Show all organization sponsors on this event</p>
          <p className="text-xs text-gray-500 mt-0.5">
            When on, every sponsor from Settings &rarr; Website &rarr; Sponsors appears here too. Turn off to feature only the sponsors you add below.
          </p>
        </div>
      </label>

      {/* Featured sponsors for this event */}
      <div className="rounded-lg border bg-white">
        <div className="px-4 py-3 border-b">
          <p className="text-sm font-semibold text-gray-900">Featured on this event</p>
        </div>
        {links.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-400 text-center">
            No event-specific sponsors yet.{showOrgSponsors ? ' Your org sponsors will still appear.' : ''}
          </p>
        ) : (
          <ul className="divide-y">
            {links.map((s) => (
              <li key={s.id} className="px-4 py-3">
                <div className="flex items-center gap-3">
                  {s.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.logo_url} alt={s.name} className="h-8 w-16 object-contain shrink-0" />
                  ) : (
                    <div className="h-8 w-16 rounded bg-gray-100 flex items-center justify-center text-[10px] text-gray-400 shrink-0">no logo</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{s.name}</p>
                    <p className="text-xs text-gray-400 capitalize">{s.tier}{s.sponsor_id ? ' · org sponsor' : ' · event-only'}</p>
                  </div>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => removeEventSponsor(s.id, leagueId))}
                    className="text-xs text-gray-400 hover:text-red-600 disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
                {/* Interstitial ad creative */}
                <div className="mt-2 ml-[4.75rem] flex items-center gap-3">
                  {s.ad_image_url ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={s.ad_image_url} alt="" className="h-9 w-16 object-cover rounded border" />
                      <span className="text-xs text-emerald-600 font-medium">Ad creative ✓</span>
                      <button type="button" disabled={pending} onClick={() => run(() => removeEventSponsorAd(s.id, leagueId))} className="text-xs text-gray-400 hover:text-red-600 disabled:opacity-50">
                        Remove ad
                      </button>
                    </>
                  ) : (
                    <label className="text-xs text-[var(--brand-primary)] hover:underline cursor-pointer">
                      + Add full-screen ad image
                      <input
                        type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                        disabled={pending}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAd(s.id, f); e.currentTarget.value = '' }}
                      />
                    </label>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Link an existing org sponsor */}
      {linkable.length > 0 && (
        <div className="rounded-lg border bg-white p-4">
          <p className="text-sm font-semibold text-gray-900 mb-2">Add an existing sponsor</p>
          <div className="flex flex-wrap gap-2">
            {linkable.map((s) => (
              <button
                key={s.id}
                type="button"
                disabled={pending}
                onClick={() => run(() => linkOrgSponsor(leagueId, s.id))}
                className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {s.logo_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.logo_url} alt="" className="h-4 w-8 object-contain" />
                )}
                + {s.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Add an event-only sponsor */}
      <div className="rounded-lg border bg-white p-4">
        {!adding ? (
          <button type="button" onClick={() => setAdding(true)} className="text-sm font-medium text-[var(--brand-primary)] hover:underline">
            + Add an event-only sponsor
          </button>
        ) : (
          <form ref={formRef} onSubmit={handleAdd} className="space-y-3">
            <p className="text-sm font-semibold text-gray-900">New event-only sponsor</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Name *</label>
                <input name="name" required maxLength={100} className="w-full border rounded-md px-3 py-2 text-sm" placeholder="Acme Co." />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Website (optional)</label>
                <input name="website_url" type="url" className="w-full border rounded-md px-3 py-2 text-sm" placeholder="https://" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Tier</label>
                <select name="tier" defaultValue="standard" className="w-full border rounded-md px-3 py-2 text-sm capitalize">
                  {TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Logo (PNG/SVG, ≤2 MB)</label>
                <input name="logo" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="w-full text-sm" />
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={pending} className="px-4 py-2 rounded-md bg-[var(--brand-primary)] text-white text-sm font-medium disabled:opacity-50">
                {pending ? 'Adding…' : 'Add sponsor'}
              </button>
              <button type="button" onClick={() => { setAdding(false); setError(null) }} className="px-4 py-2 rounded-md border text-sm text-gray-600">
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Performance */}
      {stats.length > 0 && (() => {
        const orgName = new Map(orgSponsors.map((s) => [s.id, s.name]))
        const linkName = new Map(links.map((l) => [l.id, l.name]))
        const resolveName = (key: string) =>
          key.startsWith('org-') ? (orgName.get(key.slice(4)) ?? 'Org sponsor') : (linkName.get(key) ?? 'Sponsor')
        const rows = [...stats].sort((a, b) => b.impressions - a.impressions)
        return (
          <div className="rounded-lg border bg-white">
            <div className="px-4 py-3 border-b">
              <p className="text-sm font-semibold text-gray-900">Performance</p>
              <p className="text-xs text-gray-400 mt-0.5">All-time impressions (display screens) and website clicks.</p>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="text-left font-medium px-4 py-2">Sponsor</th>
                  <th className="text-right font-medium px-4 py-2">Impressions</th>
                  <th className="text-right font-medium px-4 py-2">Clicks</th>
                  <th className="text-right font-medium px-4 py-2">CTR</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.sponsor_key}>
                    <td className="px-4 py-2 text-gray-900 truncate max-w-[12rem]">{resolveName(r.sponsor_key)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-700">{r.impressions.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-700">{r.clicks.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-400">
                      {r.impressions > 0 ? `${((r.clicks / r.impressions) * 100).toFixed(1)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })()}
    </div>
  )
}
