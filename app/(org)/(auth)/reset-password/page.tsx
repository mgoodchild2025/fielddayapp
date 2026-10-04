'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { requestPasswordReset } from '@/actions/auth'
import Link from 'next/link'

const schema = z.object({
  email: z.string().email('Invalid email address'),
})

type FormData = z.infer<typeof schema>

export default function ResetPasswordPage() {
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  async function onSubmit(data: FormData) {
    setLoading(true)
    setError(null)
    // The server sends the link (works in any browser — the old browser-made
    // link failed when opened from the mail app) and carries ?redirect= through
    // so the player lands back where they were headed.
    const redirectTo = new URLSearchParams(window.location.search).get('redirect') ?? undefined
    try {
      const res = await requestPasswordReset({ email: data.email, redirectTo })
      if (res.error) setError(res.error)
      else setSent(true)
    } catch {
      setError("Couldn't reach the server — check your connection and try again.")
    }
    setLoading(false)
  }

  if (sent) {
    return (
      <div className="min-h-dvh flex items-center justify-center px-4" style={{ backgroundColor: 'var(--brand-bg)' }}>
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold mb-2" style={{ fontFamily: 'var(--brand-heading-font)' }}>Check your email</h1>
          <p className="text-gray-600">If an account with that email exists, we sent a password reset link. It works on any device and expires in an hour.</p>
          <Link href="/login" className="mt-6 inline-flex items-center min-h-10 text-sm font-medium text-brand-primary hover:underline">
            Back to sign in
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh flex items-center justify-center px-4" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <div className="w-full max-w-md">
        <h1 className="text-3xl font-bold uppercase mb-8 text-center" style={{ fontFamily: 'var(--brand-heading-font)' }}>
          Reset Password
        </h1>
        <form onSubmit={handleSubmit(onSubmit)} className="bg-white rounded-lg shadow-sm border p-5 sm:p-8 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="email">Email address</label>
            <input
              {...register('email')}
              id="email"
              type="email"
              autoComplete="email"
              aria-invalid={errors.email ? true : undefined}
              aria-describedby={errors.email ? 'email-error' : undefined}
              className="w-full border rounded-md px-3 py-2 text-base focus:outline-none focus:ring-2"
            />
            {errors.email && <p id="email-error" role="alert" className="text-red-600 text-xs mt-1">{errors.email.message}</p>}
          </div>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="press w-full min-h-11 rounded-md font-semibold bg-brand-primary text-on-brand disabled:opacity-60"
          >
            {loading ? 'Sending…' : 'Send Reset Link'}
          </button>
          <Link href="/login" className="flex items-center justify-center min-h-10 text-sm text-gray-600 hover:underline">
            Back to sign in
          </Link>
        </form>
      </div>
    </div>
  )
}
