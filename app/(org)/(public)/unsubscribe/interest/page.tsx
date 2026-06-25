import { verifyInterestUnsubToken } from '@/lib/unsubscribe'
import { unsubscribeInterest } from '@/actions/event-interest'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Unsubscribe' }

export default async function InterestUnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  const parsed = token ? verifyInterestUnsubToken(token) : null

  let ok = false
  if (parsed) {
    const res = await unsubscribeInterest(parsed.interestId)
    ok = !res.error
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gray-50">
      <div className="w-full max-w-md bg-white rounded-2xl border shadow-sm p-8 text-center">
        {ok ? (
          <>
            <div className="text-3xl mb-3">✓</div>
            <h1 className="text-xl font-bold mb-2">You&apos;re unsubscribed</h1>
            <p className="text-sm text-gray-600">
              You won&apos;t receive any more notifications about this event. You can sign up again
              anytime from the event page.
            </p>
          </>
        ) : (
          <>
            <div className="text-3xl mb-3">⚠️</div>
            <h1 className="text-xl font-bold mb-2">Link not valid</h1>
            <p className="text-sm text-gray-600">
              This unsubscribe link is invalid or has expired.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
