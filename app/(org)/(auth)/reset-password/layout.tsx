import type { Metadata } from 'next'

// The pages are client components (no metadata export), so the title lives here.
export const metadata: Metadata = { title: 'Reset password' }

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children
}
