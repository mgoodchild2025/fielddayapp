'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { deleteOrganization } from '@/actions/platform'

export function DeleteOrgButton({ orgId, orgName }: { orgId: string; orgName: string }) {
  const [step, setStep] = useState<'idle' | 'confirm' | 'type'>('idle')
  const [typed, setTyped] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleDelete() {
    if (typed !== orgName) return
    setError(null)
    startTransition(async () => {
      const result = await deleteOrganization(orgId)
      if (result.error) {
        setError(result.error)
      } else {
        router.push('/super')
      }
    })
  }

  if (step === 'idle') {
    return (
      <button
        onClick={() => setStep('confirm')}
        className="w-full py-2 px-3 rounded-md text-sm font-medium border border-red-300 text-red-700 hover:bg-red-50"
      >
        Delete Organization
      </button>
    )
  }

  if (step === 'confirm') {
    return (
      <div className="space-y-2">
        <p className="text-xs text-red-700">
          This will permanently delete <strong>{orgName}</strong> and all associated data — leagues, teams, members, games, and payments. This cannot be undone.
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setStep('type')}
            className="flex-1 py-2 px-3 rounded-md text-sm font-medium bg-red-600 text-white hover:bg-red-700"
          >
            I understand, continue
          </button>
          <button
            onClick={() => setStep('idle')}
            className="flex-1 py-2 px-3 rounded-md text-sm font-medium border border-gray-300 text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-red-700">
        Type <strong>{orgName}</strong> to confirm deletion:
      </p>
      <input
        type="text"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        placeholder={orgName}
        className="w-full border border-red-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
        autoFocus
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={handleDelete}
          disabled={typed !== orgName || isPending}
          className="flex-1 py-2 px-3 rounded-md text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-40"
        >
          {isPending ? 'Deleting…' : 'Delete permanently'}
        </button>
        <button
          onClick={() => { setStep('idle'); setTyped('') }}
          className="flex-1 py-2 px-3 rounded-md text-sm font-medium border border-gray-300 text-gray-600 hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
