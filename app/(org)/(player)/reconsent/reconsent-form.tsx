'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { acceptPlayerReconsent } from '@/actions/player-consents'

export function ReconsentForm({
  versionId,
  versionLabel,
  redirectTo,
}: {
  versionId: string
  versionLabel: string
  redirectTo: string
}) {
  const router = useRouter()
  const [checked, setChecked] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function accept() {
    setError(null)
    startTransition(async () => {
      const res = await acceptPlayerReconsent(versionId, versionLabel)
      if (res.error) setError(res.error)
      else router.replace(redirectTo || '/dashboard')
    })
  }

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.replace('/login')
  }

  return (
    <div className="space-y-4">
      <label className="flex items-start gap-3 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-gray-300"
        />
        <span className="text-sm text-gray-700">
          I have read and agree to the updated Privacy Policy.
        </span>
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          onClick={accept}
          disabled={!checked || isPending}
          className="px-5 py-2.5 rounded-md text-sm font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          {isPending ? 'Saving…' : 'Accept and continue'}
        </button>
        <button onClick={signOut} className="text-sm text-gray-500 hover:text-gray-700">
          Sign out
        </button>
      </div>
    </div>
  )
}
