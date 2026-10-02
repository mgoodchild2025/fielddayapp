'use client'

import { ErrorScreen } from '@/components/errors/error-screen'

// Inside the area layout, so the mobile tab bar stays on screen.
export default function AreaError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorScreen {...props} />
}
