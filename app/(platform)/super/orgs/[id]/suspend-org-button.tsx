'use client'

import { useState } from 'react'
import { setOrgStatus } from '@/actions/platform'

export function SuspendOrgButton({ orgId, currentStatus }: { orgId: string; currentStatus: string }) {
  const [loading, setLoading] = useState(false)
  const [confirm, setConfirm] = useState(false)

  const isSuspended = currentStatus === 'suspended'

  async function handleClick() {
    if (!isSuspended && !confirm) {
      setConfirm(true)
      return
    }
    setLoading(true)
    await setOrgStatus(orgId, isSuspended ? 'active' : 'suspended')
    setLoading(false)
    setConfirm(false)
  }

  if (isSuspended) {
    return (
      <button
        onClick={handleClick}
        disabled={loading}
        className="w-full py-2 px-3 rounded-md text-sm font-medium border border-green-300 text-green-700 hover:bg-green-50 disabled:opacity-60"
      >
        {loading ? 'Activating…' : 'Re-activate Organization'}
      </button>
    )
  }

  return (
    <div className="space-y-2">
      {confirm && (
        <p className="text-xs text-red-600">
          This will suspend the organization and block access for all members. Click again to confirm.
        </p>
      )}
      <button
        onClick={handleClick}
        disabled={loading}
        className={`w-full py-2 px-3 rounded-md text-sm font-medium border disabled:opacity-60 ${
          confirm
            ? 'bg-red-600 text-white border-red-600 hover:bg-red-700'
            : 'border-red-300 text-red-700 hover:bg-red-50'
        }`}
      >
        {loading ? 'Suspending…' : confirm ? 'Confirm Suspend' : 'Suspend Organization'}
      </button>
      {confirm && (
        <button
          onClick={() => setConfirm(false)}
          className="w-full py-1.5 text-xs text-gray-500 hover:text-gray-700"
        >
          Cancel
        </button>
      )}
    </div>
  )
}
