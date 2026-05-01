'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { updatePassword } from '@/actions/auth'
import Link from 'next/link'

const schema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirm: z.string(),
}).refine((d) => d.password === d.confirm, {
  message: 'Passwords do not match',
  path: ['confirm'],
})

type FormData = z.infer<typeof schema>

export default function ResetPasswordConfirmPage() {
  const [serverError, setServerError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  async function onSubmit(data: FormData) {
    setLoading(true)
    setServerError(null)
    const result = await updatePassword(data.password)
    if (result?.error) {
      setServerError(result.error)
      setLoading(false)
    }
    // On success the server action redirects to /dashboard
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <div className="w-full max-w-md">
        <h1 className="text-3xl font-bold uppercase mb-8 text-center" style={{ fontFamily: 'var(--brand-heading-font)' }}>
          Choose New Password
        </h1>
        <form onSubmit={handleSubmit(onSubmit)} className="bg-white rounded-lg shadow-sm border p-8 space-y-5">
          {serverError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
              {serverError}
            </div>
          )}

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

          <Link href="/login" className="block text-sm text-center text-gray-500 hover:underline pt-2">
            Back to sign in
          </Link>
        </form>
      </div>
    </div>
  )
}
