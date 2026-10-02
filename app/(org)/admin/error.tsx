'use client'

import { ErrorScreen } from '@/components/errors/error-screen'

// Inside the admin layout, so the sidebar stays and the way out is admin home.
export default function AdminError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorScreen {...props} homeHref="/admin/dashboard" homeLabel="Admin home" />
}
