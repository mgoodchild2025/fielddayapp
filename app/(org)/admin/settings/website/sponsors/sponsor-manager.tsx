'use client'

import { useState, useRef, useTransition } from 'react'
import Image from 'next/image'
import { upsertSponsor, deleteSponsor, uploadSponsorLogo } from '@/actions/org-sponsors'

type Sponsor = { id: string; name: string; logo_url: string | null; website_url: string | null; tier: string; display_order: number }
type Tier = 'gold' | 'silver' | 'bronze' | 'standard'

const TIERS: { value: Tier; label: string; color: string }[] = [
  { value: 'gold',     label: 'Gold',     color: 'bg-yellow-100 text-yellow-800' },
  { value: 'silver',   label: 'Silver',   color: 'bg-gray-100 text-gray-700' },
  { value: 'bronze',   label: 'Bronze',   color: 'bg-orange-100 text-orange-800' },
  { value: 'standard', label: 'Standard', color: 'bg-blue-50 text-blue-700' },
]

function TierBadge({ tier }: { tier: string }) {
  const t = TIERS.find(t => t.value === tier) ?? TIERS[3]
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${t.color}`}>{t.label}</span>
}

function SponsorForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Partial<Sponsor>
  onSave: (s: Sponsor) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [website, setWebsite] = useState(initial?.website_url ?? '')
  const [tier, setTier] = useState<Tier>((initial?.tier as Tier) ?? 'standard')
  const [saving, startSave] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startSave(async () => {
      const result = await upsertSponsor(initial?.id ?? null, { name, website_url: website, tier })
      if (result.error) { setError(result.error); return }
      onSave({ id: result.id!, name, logo_url: initial?.logo_url ?? null, website_url: website || null, tier, display_order: initial?.display_order ?? 0 })
    })
  }

  return (
    <form onSubmit={handleSubmit} className="bg-gray-50 rounded-xl border p-4 space-y-3">
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Sponsor Name *</label>
          <input value={name} onChange={e => setName(e.target.value)} required className="w-full border rounded-md px-3 py-2 text-sm" placeholder="Acme Corp" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Website URL</label>
          <input value={website} onChange={e => setWebsite(e.target.value)} type="url" className="w-full border rounded-md px-3 py-2 text-sm font-mono" placeholder="https://example.com" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Tier</label>
        <div className="flex flex-wrap gap-2">
          {TIERS.map(t => (
            <button key={t.value} type="button" onClick={() => setTier(t.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border-2 transition-all ${tier === t.value ? 'border-gray-800 ' + t.color : 'border-transparent ' + t.color + ' opacity-60'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-semibold text-white rounded-md disabled:opacity-60" style={{ backgroundColor: 'var(--brand-primary)' }}>
          {saving ? 'Saving…' : initial?.id ? 'Update' : 'Add Sponsor'}
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm border rounded-md hover:bg-gray-50">Cancel</button>
      </div>
    </form>
  )
}

export function SponsorManager({ initialSponsors }: { initialSponsors: Sponsor[] }) {
  const [sponsors, setSponsors] = useState<Sponsor[]>(initialSponsors)
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  function handleSaved(s: Sponsor) {
    setSponsors(prev => {
      const idx = prev.findIndex(p => p.id === s.id)
      return idx === -1 ? [...prev, s] : prev.map(p => p.id === s.id ? s : p)
    })
    setAdding(false)
    setEditingId(null)
  }

  async function handleDelete(id: string) {
    if (!confirm('Remove this sponsor?')) return
    setDeletingId(id)
    await deleteSponsor(id)
    setSponsors(prev => prev.filter(s => s.id !== id))
    setDeletingId(null)
  }

  async function handleLogoChange(sponsorId: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingId(sponsorId)
    const fd = new FormData()
    fd.append('logo', file)
    const result = await uploadSponsorLogo(sponsorId, fd)
    if (result.url) {
      setSponsors(prev => prev.map(s => s.id === sponsorId ? { ...s, logo_url: result.url } : s))
    }
    setUploadingId(null)
    if (fileRefs.current[sponsorId]) fileRefs.current[sponsorId]!.value = ''
  }

  return (
    <div className="space-y-4">
      {sponsors.length === 0 && !adding && (
        <div className="text-center py-12 border-2 border-dashed rounded-xl text-gray-400">
          <p className="text-lg">No sponsors yet</p>
          <p className="text-sm mt-1">Add sponsors to display them on your public site.</p>
        </div>
      )}

      {sponsors.map(sponsor => (
        <div key={sponsor.id}>
          {editingId === sponsor.id ? (
            <SponsorForm initial={sponsor} onSave={handleSaved} onCancel={() => setEditingId(null)} />
          ) : (
            <div className="bg-white border rounded-xl px-5 py-4 flex items-center gap-4">
              {/* Logo */}
              <div className="shrink-0 w-14 h-10 bg-gray-50 border rounded flex items-center justify-center overflow-hidden">
                {uploadingId === sponsor.id ? (
                  <span className="text-xs text-gray-400">…</span>
                ) : sponsor.logo_url ? (
                  <Image src={sponsor.logo_url} alt={sponsor.name} width={56} height={40} className="max-h-10 w-auto object-contain" unoptimized />
                ) : (
                  <span className="text-xs text-gray-400">No logo</span>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-sm">{sponsor.name}</p>
                  <TierBadge tier={sponsor.tier} />
                </div>
                {sponsor.website_url && (
                  <p className="text-xs text-gray-400 truncate mt-0.5">{sponsor.website_url}</p>
                )}
              </div>

              <div className="shrink-0 flex items-center gap-2">
                <input
                  ref={el => { fileRefs.current[sponsor.id] = el }}
                  type="file" accept="image/jpeg,image/png,image/webp,image/svg+xml" className="hidden"
                  onChange={e => handleLogoChange(sponsor.id, e)}
                />
                <button onClick={() => fileRefs.current[sponsor.id]?.click()} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded hover:bg-gray-50">
                  {sponsor.logo_url ? 'Logo' : '+ Logo'}
                </button>
                <button onClick={() => setEditingId(sponsor.id)} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded hover:bg-gray-50">Edit</button>
                <button onClick={() => handleDelete(sponsor.id)} disabled={deletingId === sponsor.id} className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 disabled:opacity-50">
                  {deletingId === sponsor.id ? '…' : 'Remove'}
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      {adding ? (
        <SponsorForm onSave={handleSaved} onCancel={() => setAdding(false)} />
      ) : (
        <button onClick={() => setAdding(true)} className="w-full py-3 border-2 border-dashed rounded-xl text-sm text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-colors">
          + Add Sponsor
        </button>
      )}
    </div>
  )
}
