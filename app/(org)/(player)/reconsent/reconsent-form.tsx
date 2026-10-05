'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { acceptPlayerReconsent } from '@/actions/player-consents'
import { clearOfflineCache } from '@/lib/push-client'
import { safeRelativePath } from '@/lib/safe-redirect'

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
      else router.replace(safeRelativePath(redirectTo) ?? '/dashboard')
    })
  }

  async function signOut() {
    // Like every other sign-out: drop the offline copies of /dashboard etc.,
    // so the next person on a shared phone can't open them.
    clearOfflineCache()
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

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          onClick={accept}
          disabled={!checked || isPending}
          className="px-5 py-2.5 rounded-md text-sm font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          {isPending ? 'Saving…' : 'Accept and continue'}
        </button>
        <button onClick={signOut} className="press min-h-10 px-2 text-sm text-gray-600 hover:text-gray-800">
          Sign out
        </button>
      </div>
    </div>
  )
}
