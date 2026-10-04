import type { Metadata } from 'next'

// The page is a client component (no metadata export), so the title lives here.
export const metadata: Metadata = { title: 'Create an account' }

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children
}
