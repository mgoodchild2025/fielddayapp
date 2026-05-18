'use client'

import { Suspense, useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

const schema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirm: z.string(),
}).refine((d) => d.password === d.confirm, {
  message: 'Passwords do not match',
  path: ['confirm'],
})

type FormData = z.infer<typeof schema>

function ResetForm() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const code      = searchParams.get('code')       // PKCE flow — needs exchange
  const tokenHash = searchParams.get('token_hash') // token_hash flow — verify on submit

  // 'exchanging' while we do the PKCE code swap; 'ready' once session exists
  const [status, setStatus] = useState<'exchanging' | 'ready' | 'error'>(
    code ? 'exchanging' : 'ready'
  )
  const [serverError, setServerError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  // Exchange the PKCE code for a session as soon as the page mounts.
  // Only runs when the link came via the PKCE flow (code param present).
  useEffect(() => {
    if (!code) return
    const supabase = createClient()
    supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (error) {
        setStatus('error')
        setServerError('This reset link has expired or already been used. Please request a new one.')
      } else {
        setStatus('ready')
      }
    })
  }, [code])

  async function onSubmit(data: FormData) {
    setLoading(true)
    setServerError(null)
    const supabase = createClient()

    // token_hash flow: verify the OTP on submit (session not yet established)
    if (tokenHash && !code) {
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' })
      if (error) {
        setServerError(error.message)
        setLoading(false)
        return
      }
    }

    const { error } = await supabase.auth.updateUser({ password: data.password })
    if (error) {
      setServerError(error.message)
      setLoading(false)
      return
    }

    const isAppDomain = window.location.hostname.startsWith('app.')
    router.push(isAppDomain ? '/super' : '/my-events')
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <div className="w-full max-w-md">
        <h1 className="text-3xl font-bold uppercase mb-8 text-center" style={{ fontFamily: 'var(--brand-heading-font)' }}>
          Choose New Password
        </h1>

        {status === 'exchanging' ? (
          <p className="text-center text-gray-500 text-sm">Verifying reset link…</p>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="bg-white rounded-lg shadow-sm border p-8 space-y-5">
            {serverError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
                {serverError}
                {status === 'error' && (
                  <Link href="/reset-password" className="block mt-2 font-medium underline">
                    Request a new reset link
                  </Link>
                )}
              </div>
            )}

            {status !== 'error' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="password">
                    New password
                  </label>
                  <input
                    {...register('password')}
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    className="w-full border rounded-md px-3 py-2 text-base focus:outline-none focus:ring-2"
                  />
                  {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="confirm">
                    Confirm new password
                  </label>
                  <input
                    {...register('confirm')}
                    id="confirm"
                    type="password"
                    autoComplete="new-password"
                    className="w-full border rounded-md px-3 py-2 text-base focus:outline-none focus:ring-2"
                  />
                  {errors.confirm && <p className="text-red-500 text-xs mt-1">{errors.confirm.message}</p>}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 rounded-md font-semibold text-white transition-opacity disabled:opacity-60"
                  style={{ backgroundColor: 'var(--brand-primary)' }}
                >
                  {loading ? 'Saving…' : 'Set New Password'}
                </button>
              </>
            )}

            <Link href="/login" className="block text-sm text-center text-gray-500 hover:underline pt-2">
              Back to sign in
            </Link>
          </form>
        )}
      </div>
    </div>
  )
}

export default function ResetPasswordConfirmPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  )
}
