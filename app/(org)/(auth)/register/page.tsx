'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { signUp } from '@/actions/auth'
import Link from 'next/link'

const schema = z.object({
  full_name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirm_password: z.string(),
}).refine((d) => d.password === d.confirm_password, {
  message: 'Passwords do not match',
  path: ['confirm_password'],
})

type FormData = z.infer<typeof schema>

export default function RegisterPage() {
  const [serverError, setServerError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  async function onSubmit(data: FormData) {
    setLoading(true)
    setServerError(null)
    const result = await signUp({ email: data.email, password: data.password, fullName: data.full_name })
    if (result?.error) {
      setServerError(result.error)
      setLoading(false)
    } else {
      setSuccess(true)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: 'var(--brand-bg)' }}>
        <div className="text-center max-w-md">
          <div className="text-5xl mb-4">✓</div>
          <h1 className="text-2xl font-bold mb-2" style={{ fontFamily: 'var(--brand-heading-font)' }}>Check your email</h1>
          <p className="text-gray-600">We sent a confirmation link to your email address. Click it to activate your account.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <div className="w-full max-w-md">
        <h1 className="text-3xl font-bold uppercase mb-8 text-center" style={{ fontFamily: 'var(--brand-heading-font)' }}>
          Create Account
        </h1>
        <form onSubmit={handleSubmit(onSubmit)} className="bg-white rounded-lg shadow-sm border p-8 space-y-5">
          {serverError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
              {serverError}
            </div>
          )}
          {[
            { id: 'full_name', label: 'Full Name', type: 'text', autoComplete: 'name' },
            { id: 'email', label: 'Email', type: 'email', autoComplete: 'email' },
            { id: 'password', label: 'Password', type: 'password', autoComplete: 'new-password' },
            { id: 'confirm_password', label: 'Confirm Password', type: 'password', autoComplete: 'new-password' },
          ].map(({ id, label, type, autoComplete }) => (
            <div key={id}>
              <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor={id}>{label}</label>
              <input
                {...register(id as keyof FormData)}
                id={id}
                type={type}
                autoComplete={autoComplete}
                className="w-full border rounded-md px-3 py-2 text-base focus:outline-none focus:ring-2"
              />
              {errors[id as keyof FormData] && (
                <p className="text-red-500 text-xs mt-1">{errors[id as keyof FormData]?.message}</p>
              )}
            </div>
          ))}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-md font-semibold text-white transition-opacity disabled:opacity-60"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            {loading ? 'Creating account…' : 'Create Account'}
          </button>
          <p className="text-sm text-center text-gray-500 pt-2">
            Already have an account?{' '}
            <Link href="/login" className="hover:underline" style={{ color: 'var(--brand-primary)' }}>Sign in</Link>
          </p>
        </form>
      </div>
    </div>
  )
}
