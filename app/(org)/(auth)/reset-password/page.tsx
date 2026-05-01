'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { resetPassword } from '@/actions/auth'
import Link from 'next/link'

const schema = z.object({
  email: z.string().email('Invalid email address'),
})

type FormData = z.infer<typeof schema>

export default function ResetPasswordPage() {
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  async function onSubmit(data: FormData) {
    setLoading(true)
    await resetPassword(data.email)
    setSent(true)
    setLoading(false)
  }

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: 'var(--brand-bg)' }}>
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold mb-2" style={{ fontFamily: 'var(--brand-heading-font)' }}>Check your email</h1>
          <p className="text-gray-600">If an account with that email exists, we sent a password reset link.</p>
          <Link href="/login" className="mt-6 inline-block text-sm hover:underline" style={{ color: 'var(--brand-primary)' }}>
            Back to sign in
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <div className="w-full max-w-md">
        <h1 className="text-3xl font-bold uppercase mb-8 text-center" style={{ fontFamily: 'var(--brand-heading-font)' }}>
          Reset Password
        </h1>
        <form onSubmit={handleSubmit(onSubmit)} className="bg-white rounded-lg shadow-sm border p-8 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="email">Email address</label>
            <input
              {...register('email')}
              id="email"
              type="email"
              autoComplete="email"
              className="w-full border rounded-md px-3 py-2 text-base focus:outline-none focus:ring-2"
            />
            {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-md font-semibold text-white transition-opacity disabled:opacity-60"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            {loading ? 'Sending…' : 'Send Reset Link'}
          </button>
          <Link href="/login" className="block text-sm text-center text-gray-500 hover:underline pt-2">
            Back to sign in
          </Link>
        </form>
      </div>
    </div>
  )
}
