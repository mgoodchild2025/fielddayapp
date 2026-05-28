'use client'

import { useState, useTransition } from 'react'
import { recordManualAcceptance } from '@/actions/tenant-consent'

interface Props {
  organizationId: string
  admins: { userId: string; name: string; email: string | null }[]
  versions: { id: string; version: string; published_at: string; document: { slug: string; title: string } | null }[]
}

const DOC_LABELS: Record<string, string> = {
  'terms':          'Terms of Service',
  'tenant-privacy': 'Privacy Policy for Tenants',
  'dpa':            'Data Processing Addendum',
}

export function ManualAcceptanceForm({ organizationId, admins, versions }: Props) {
  const [userId, setUserId] = useState(admins[0]?.userId ?? '')
  const [versionId, setVersionId] = useState('')
  const [acceptedAt, setAcceptedAt] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const selectedVersion = versions.find((v) => v.id === versionId)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!userId || !versionId || !acceptedAt) {
      setError('User, version, and accepted date are required.')
      return
    }
    setError(null)
    setSuccess(false)
    startTransition(async () => {
      const result = await recordManualAcceptance({
        organizationId,
        acceptedByUserId: userId,
        documentSlug: selectedVersion?.document?.slug ?? '',
        documentVersion: selectedVersion?.version ?? '',
        documentVersionId: versionId,
        acceptedAt: new Date(acceptedAt).toISOString(),
        notes,
      })
      if (result.error) {
        setError(result.error)
      } else {
        setSuccess(true)
        setNotes('')
        setVersionId('')
        setTimeout(() => { setSuccess(false); window.location.reload() }, 1500)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Accepted by</label>
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {admins.map((a) => (
              <option key={a.userId} value={a.userId}>{a.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Accepted on</label>
          <input
            type="date"
            value={acceptedAt}
            onChange={(e) => setAcceptedAt(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1">Document version</label>
        <select
          value={versionId}
          onChange={(e) => setVersionId(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="">Select a document version…</option>
          {versions.map((v) => (
            <option key={v.id} value={v.id}>
              {DOC_LABELS[v.document?.slug ?? ''] ?? v.document?.slug ?? '?'} — v{v.version}{' '}
              ({new Date(v.published_at).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })})
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1">Notes (required for manual records)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Countersigned DPA filed in shared drive folder X, ref. 2025-001"
          rows={2}
          className="w-full bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500 placeholder-gray-600"
        />
      </div>

      {error && <p className="text-sm text-red-400 bg-red-900/20 px-3 py-2 rounded-lg">{error}</p>}
      {success && <p className="text-sm text-emerald-400">✓ Manual acceptance recorded.</p>}

      <button
        type="submit"
        disabled={isPending || !userId || !versionId}
        className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 rounded-lg transition-colors"
      >
        {isPending ? 'Saving…' : 'Record manual acceptance'}
      </button>
    </form>
  )
}
