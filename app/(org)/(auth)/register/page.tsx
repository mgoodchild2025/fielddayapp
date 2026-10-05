'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useSearchParams } from 'next/navigation'
import { z } from 'zod'
import { signUp } from '@/actions/auth'
import Link from 'next/link'
import { GoogleAuthButton } from '@/components/auth/google-auth-button'
import { safeRelativePath } from '@/lib/safe-redirect'
import { BackLink } from '@/components/ui/back-link'
import { Eye, EyeOff } from 'lucide-react'
import { safeAction } from '@/lib/action-errors'

// One password field with a show toggle instead of "confirm password": typing
// it twice on a phone keyboard is the friction, and seeing it is the check.
const schema = z.object({
  full_name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

type FormData = z.infer<typeof schema>

export default function RegisterPage() {
  const [serverError, setServerError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  const searchParams = useSearchParams()
  // Only allow relative paths to prevent open redirect
  const redirectParam = searchParams.get('redirect') ?? ''
  const redirectTo = safeRelativePath(redirectParam) ?? ''

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    mode: 'onTouched',
  })

  async function onSubmit(data: FormData) {
    setLoading(true)
    setServerError(null)

    const result = await safeAction(signUp({ email: data.email, password: data.password, fullName: data.full_name, redirectTo }))
    if (result?.error) {
      setServerError(result.error)
      setLoading(false)
    } else {
      setSentTo(data.email)
      setLoading(false)
    }
  }

  if (sentTo) {
    return (
      <div className="min-h-dvh flex items-center justify-center px-4" style={{ backgroundColor: 'var(--brand-bg)' }}>
        <div className="text-center max-w-md">
          <div className="text-5xl mb-4">✓</div>
          <h1 className="text-2xl font-bold mb-2" style={{ fontFamily: 'var(--brand-heading-font)' }}>Check your email</h1>
          <p className="text-gray-600">
            We sent a confirmation link to <strong className="text-gray-900 break-all">{sentTo}</strong>. Tap it to activate your account
            {redirectTo ? ' — it brings you straight back here.' : '.'}
          </p>
          <p className="mt-3 text-sm text-gray-500">Not there in a minute? Check your spam or promotions folder.</p>
          <button
            type="button"
            onClick={() => { setSentTo(null); reset({ full_name: '', email: '', password: '' }) }}
            className="press mt-4 inline-flex items-center min-h-11 px-4 rounded-md border text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            Wrong address? Start over
          </button>
        </div>
      </div>
    )
  }

  const loginHref = redirectTo ? `/login?redirect=${encodeURIComponent(redirectTo)}` : '/login'

  return (
    <div className="min-h-dvh flex items-center justify-center px-4" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <div className="w-full max-w-md py-8">
        {/* A way out, like sign-in: back to the event they came from, else home. */}
        <div className="mb-2">
          <BackLink
            fallbackHref={redirectTo.startsWith('/events') ? redirectTo : '/'}
            fallbackLabel={redirectTo.startsWith('/events') ? 'Back to the event' : 'Home'}
          />
        </div>
        <h1 className="text-3xl font-bold uppercase mb-6 text-center" style={{ fontFamily: 'var(--brand-heading-font)' }}>
          Create Account
        </h1>
        <div className="bg-white rounded-lg shadow-sm border p-5 sm:p-8 space-y-5">
          <GoogleAuthButton redirectTo={redirectTo} label="Sign up with Google" />
          <div className="relative">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
            <div className="relative flex justify-center text-xs text-gray-500"><span className="bg-white px-2">or create account with email</span></div>
          </div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {serverError && (
            <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
              {serverError}
            </div>
          )}
          {[
            { id: 'full_name', label: 'Full Name', type: 'text', autoComplete: 'name' },
            { id: 'email', label: 'Email', type: 'email', autoComplete: 'email' },
          ].map(({ id, label, type, autoComplete }) => (
            <div key={id}>
              <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor={id}>{label}</label>
              <input
                {...register(id as keyof FormData)}
                id={id}
                type={type}
                autoComplete={autoComplete}
                autoCapitalize={id === 'email' ? 'none' : 'words'}
                aria-invalid={errors[id as keyof FormData] ? true : undefined}
                aria-describedby={errors[id as keyof FormData] ? `${id}-error` : undefined}
                className="w-full border rounded-md px-3 py-2 text-base focus:outline-none focus:ring-2"
              />
              {errors[id as keyof FormData] && (
                <p id={`${id}-error`} role="alert" className="text-red-600 text-xs mt-1">{errors[id as keyof FormData]?.message}</p>
              )}
            </div>
          ))}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="password">Password</label>
            <div className="relative">
              <input
                {...register('password')}
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                aria-invalid={errors.password ? true : undefined}
                aria-describedby={errors.password ? 'password-error' : 'password-hint'}
                className="w-full border rounded-md px-3 py-2 pr-11 text-base focus:outline-none focus:ring-2"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 flex items-center justify-center w-11 text-gray-500 hover:text-gray-700"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.password
              ? <p id="password-error" role="alert" className="text-red-600 text-xs mt-1">{errors.password.message}</p>
              : <p id="password-hint" className="text-gray-500 text-xs mt-1">At least 8 characters.</p>}
          </div>
          <button
            type="submit"
            disabled={loading}
            className="press w-full min-h-11 rounded-md font-semibold bg-brand-primary text-on-brand disabled:opacity-60"
          >
            {loading ? 'Creating account…' : 'Create Account'}
          </button>
          <p className="text-sm text-center text-gray-500 pt-2">
            Already have an account?{' '}
            <Link href={loginHref} className="inline-flex items-center min-h-10 font-medium text-brand-primary hover:underline">Sign in</Link>
          </p>
        </form>
        </div>
      </div>
    </div>
  )
}
