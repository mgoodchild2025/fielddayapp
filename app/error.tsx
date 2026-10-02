'use client'

import { ErrorScreen } from '@/components/errors/error-screen'

// Fallback boundary (also catches errors thrown by the org layout itself).
// Area boundaries — (public), (player), admin — keep their layout's chrome.
export default function RootError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorScreen {...props} />
}
