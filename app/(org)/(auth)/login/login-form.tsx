'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { login } from '@/actions/auth'
import Link from 'next/link'

const schema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

type FormData = z.infer<typeof schema>

export function LoginForm({ redirectTo }: { redirectTo?: string }) {
  const [serverError, setServerError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  async function onSubmit(data: FormData) {
    setLoading(true)
    setServerError(null)
    const result = await login({ ...data, redirectTo })
    if (result?.error) {
      setServerError(result.error)
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="bg-white rounded-lg shadow-sm border p-8 space-y-5">
      {serverError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
          {serverError}
        </div>
      )}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="email">Email</label>
        <input
          {...register('email')}
          id="email"
          type="email"
          autoComplete="email"
          className="w-full border rounded-md px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-offset-1"
          style={{ '--tw-ring-color': 'var(--brand-primary)' } as React.CSSProperties}
        />
        {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="password">Password</label>
        <input
          {...register('password')}
          id="password"
          type="password"
          autoComplete="current-password"
          className="w-full border rounded-md px-3 py-2 text-base focus:outline-none focus:ring-2"
        />
        {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
      </div>
      <button
        type="submit"
        disabled={loading}
        className="w-full py-2.5 rounded-md font-semibold text-white transition-opacity disabled:opacity-60"
        style={{ backgroundColor: 'var(--brand-primary)' }}
      >
        {loading ? 'Signing in…' : 'Sign In'}
      </button>
      <div className="flex items-center justify-between text-sm text-gray-500 pt-2">
        <Link href="/reset-password" className="hover:underline">Forgot password?</Link>
        <Link href="/register" className="hover:underline">Create account</Link>
      </div>
    </form>
  )
}
