import type { Metadata, Viewport } from 'next'
import { notFound } from 'next/navigation'
import { doorOrgId } from '@/lib/door/service'

// Door Alert pages: public (visitor), pairing and display screens. Outside the
// org layout on purpose — no nav, no footer, no tab bar — and never indexed.
// Every page 404s unless the org's plan includes Door Alert.
export const metadata: Metadata = {
  title: 'Door Alert',
  robots: { index: false, follow: false },
  referrer: 'no-referrer', // URLs carry tokens
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0B0B0C',
  viewportFit: 'cover',
}

export default async function DoorLayout({ children }: { children: React.ReactNode }) {
  if (!(await doorOrgId())) notFound()
  return children
}
