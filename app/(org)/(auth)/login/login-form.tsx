'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { login } from '@/actions/auth'
import Link from 'next/link'
import { Eye, EyeOff } from 'lucide-react'
import { GoogleAuthButton } from '@/components/auth/google-auth-button'

const schema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

type FormData = z.infer<typeof schema>

export function LoginForm({ redirectTo }: { redirectTo?: string }) {
  const [serverError, setServerError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

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
    <div className="bg-white rounded-lg shadow-sm border p-8 space-y-5">
      <GoogleAuthButton redirectTo={redirectTo} label="Continue with Google" />
      <div className="relative">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
        <div className="relative flex justify-center text-xs text-gray-400"><span className="bg-white px-2">or sign in with email</span></div>
      </div>
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
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
        <div className="relative">
          <input
            {...register('password')}
            id="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            className="w-full border rounded-md px-3 py-2 pr-10 text-base focus:outline-none focus:ring-2"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
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
        <Link href={redirectTo ? `/register?redirect=${encodeURIComponent(redirectTo)}` : '/register'} className="hover:underline">Create account</Link>
      </div>
    </form>
    </div>
  )
}
