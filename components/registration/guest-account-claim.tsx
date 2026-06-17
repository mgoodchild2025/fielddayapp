'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { claimGuestRegistration } from '@/actions/registrations'

interface Props {
  registrationId: string
  guestEmail: string
}

/** Optional upgrade on the guest success page: set a password to turn the guest
 *  registration into a real account (frictionless now, claimable later). */
export function GuestAccountClaim({ registrationId, guestEmail }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function claim() {
    setBusy(true); setError(null)
    const result = await claimGuestRegistration({ registrationId, password })
    if (result.error || !result.email) {
      setError(result.error ?? 'Could not create your account.')
      setBusy(false)
      return
    }
    // Sign the new account in, then send them to their dashboard.
    const supabase = createClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: result.email, password })
    if (signInError) {
      // Account exists but sign-in failed — fall back to the login page.
      router.push('/login')
      return
    }
    router.push('/dashboard')
  }

  if (!open) {
    return (
      <div className="rounded-xl border bg-white p-5 text-left">
        <p className="font-semibold text-gray-900">Save your spot to an account</p>
        <p className="text-sm text-gray-500 mt-1">
          Create a free account for <strong>{guestEmail}</strong> to see your events, receipts, and waivers any time.
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 px-4 py-2 rounded-md text-sm font-semibold text-white"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          Create an account
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-xl border bg-white p-5 text-left space-y-3">
      <div>
        <p className="font-semibold text-gray-900">Create your account</p>
        <p className="text-sm text-gray-500 mt-0.5">Set a password for <strong>{guestEmail}</strong>.</p>
      </div>

      {error && <div className="rounded-md bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm">{error}</div>}

      <label className="block text-sm font-medium text-gray-700">
        Password
        <div className="relative mt-1">
          <input
            type={show ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border rounded-md px-3 py-2 text-sm pr-10"
            placeholder="At least 8 characters"
            autoComplete="new-password"
          />
          <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" aria-label={show ? 'Hide password' : 'Show password'}>
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </label>

      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setOpen(false)} className="px-3 py-2 rounded-md border text-sm text-gray-600 hover:bg-gray-50">Not now</button>
        <button
          type="button"
          onClick={claim}
          disabled={busy || password.length < 8}
          className="px-4 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-60"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          {busy ? 'Creating…' : 'Create account'}
        </button>
      </div>
    </div>
  )
}
