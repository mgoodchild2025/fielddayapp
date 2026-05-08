import Link from 'next/link'
import { ClearCartOnMount } from '@/components/shop/clear-cart-on-mount'

interface Props {
  searchParams: Promise<{ manual?: string; instructions?: string; session_id?: string }>
}

export default async function ShopSuccessPage({ searchParams }: Props) {
  const params = await searchParams
  const isManual = params.manual === '1'
  const instructions = params.instructions ? decodeURIComponent(params.instructions) : null

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: 'var(--brand-bg)' }}>
      {/* Clear cart client-side on page load (Stripe flow clears in CartDrawer; this handles edge cases) */}
      <ClearCartOnMount />

      <div className="max-w-lg w-full py-16 text-center">
        {/* Icon */}
        <div className="w-16 h-16 rounded-full bg-green-50 border border-green-200 flex items-center justify-center mx-auto mb-5">
          <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          {isManual ? 'Order placed!' : 'Order confirmed!'}
        </h1>

        {isManual ? (
          <div className="space-y-4">
            <p className="text-gray-500 text-sm">
              Your order has been recorded. Please send payment using the instructions below
              to complete your purchase.
            </p>

            {instructions ? (
              <div className="text-left bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 mt-4">
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">Payment instructions</p>
                <p className="text-sm text-amber-900 whitespace-pre-wrap">{instructions}</p>
              </div>
            ) : (
              <p className="text-sm text-gray-500 bg-gray-50 rounded-xl px-5 py-4 border">
                Contact your league organizer to arrange payment.
              </p>
            )}

            <p className="text-xs text-gray-400 mt-2">
              Your order will be fulfilled once payment is received. Items will be ready for
              pickup at a future event.
            </p>
          </div>
        ) : (
          <p className="text-gray-500 text-sm">
            Thanks for your purchase. You&apos;ll receive a confirmation by email shortly.
            Your order will be fulfilled and ready for pickup at a future event.
          </p>
        )}

        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/shop"
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg border text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Back to shop
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            Go to dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
