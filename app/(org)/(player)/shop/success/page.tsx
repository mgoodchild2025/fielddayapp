import Link from 'next/link'
import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { requireAuth } from '@/lib/auth'

export default async function ShopSuccessPage() {
  await requireAuth()
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)

  return (
    <div className="max-w-lg mx-auto px-4 py-16 text-center">
      <div className="w-16 h-16 rounded-full bg-green-50 border border-green-200 flex items-center justify-center mx-auto mb-5">
        <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Order confirmed!</h1>
      <p className="text-gray-500 text-sm">
        Thanks for your purchase from {org.name}. You&apos;ll receive a confirmation by email shortly.
        Your order will be fulfilled and ready for pickup at a future event.
      </p>
      <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
        <Link
          href="/shop"
          className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg border text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Back to shop
        </Link>
        <Link
          href="/my-events"
          className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          View my events
        </Link>
      </div>
    </div>
  )
}
