import { verifyUnsubscribeToken } from '@/lib/unsubscribe'
import { unsubscribeMarketing } from '@/actions/player-consents'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Unsubscribe' }

const TYPE_LABEL: Record<string, string> = {
  marketing_email: 'promotional emails',
  marketing_sms: 'promotional text messages',
}

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  const parsed = token ? verifyUnsubscribeToken(token) : null

  let ok = false
  if (parsed) {
    const res = await unsubscribeMarketing(parsed.orgId, parsed.userId, parsed.type)
    ok = !res.error
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gray-50">
      <div className="w-full max-w-md bg-white rounded-2xl border shadow-sm p-8 text-center">
        {ok && parsed ? (
          <>
            <div className="text-3xl mb-3">✓</div>
            <h1 className="text-xl font-bold mb-2">You&apos;re unsubscribed</h1>
            <p className="text-sm text-gray-600">
              You will no longer receive {TYPE_LABEL[parsed.type] ?? 'marketing messages'} from this
              organization. You may still receive important account and event-related notifications.
            </p>
          </>
        ) : (
          <>
            <div className="text-3xl mb-3">⚠️</div>
            <h1 className="text-xl font-bold mb-2">Link not valid</h1>
            <p className="text-sm text-gray-600">
              This unsubscribe link is invalid or has expired. You can manage your communication
              preferences any time from your profile settings.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
