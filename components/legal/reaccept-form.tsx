'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { submitReacceptance } from '@/actions/tenant-consent'
import type { PendingReacceptanceDoc } from '@/actions/tenant-consent'

interface Props {
  orgId: string
  orgName: string
  docs: PendingReacceptanceDoc[]
  redirectTo: string
}

export function ReacceptForm({ orgId, orgName, docs, redirectTo }: Props) {
  const [accepted, setAccepted] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!accepted) {
      setError('You must accept the updated agreements to continue.')
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await submitReacceptance(orgId, accepted)
      if (result.error) {
        setError(result.error)
      } else {
        router.push(redirectTo)
      }
    })
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8">
          {/* Icon */}
          <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center mb-6">
            <svg className="w-6 h-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>

          <h1 className="text-xl font-bold text-gray-900 mb-2">Updated agreements</h1>
          <p className="text-sm text-gray-600 mb-6">
            Fieldday has updated its legal agreements. As the administrator of{' '}
            <span className="font-semibold">{orgName}</span>, you need to accept the
            updated terms before continuing.
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Document list */}
            <div className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
              {docs.map((doc) => (
                <div key={doc.slug} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <a
                        href={doc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-blue-600 hover:text-blue-800 underline underline-offset-2"
                      >
                        {doc.title}
                      </a>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
                        <span>Version {doc.version}</span>
                        {doc.effectiveDate && (
                          <span>
                            · Effective{' '}
                            {new Date(doc.effectiveDate + 'T00:00:00').toLocaleDateString('en-CA', {
                              month: 'long', day: 'numeric', year: 'numeric',
                            })}
                          </span>
                        )}
                      </div>
                      {doc.reconsentSummary && (
                        <p className="mt-1.5 text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded">
                          {doc.reconsentSummary}
                        </p>
                      )}
                    </div>
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      View ↗
                    </a>
                  </div>
                </div>
              ))}
            </div>

            {/* Checkbox */}
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                className="rounded mt-0.5 shrink-0"
              />
              <span className="text-sm text-gray-700">
                I accept the updated agreements on behalf of{' '}
                <span className="font-semibold">{orgName}</span>.
              </span>
            </label>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between gap-3 pt-1">
              <a
                href="/logout"
                className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                Sign out
              </a>
              <button
                type="submit"
                disabled={!accepted || isPending}
                className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                {isPending ? 'Saving…' : 'Accept updated agreements'}
              </button>
            </div>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Non-admin members of your organization can still access the platform.
          Only organization admins need to accept on behalf of the organization.
        </p>
      </div>
    </div>
  )
}
