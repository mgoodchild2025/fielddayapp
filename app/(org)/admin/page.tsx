import { redirect } from 'next/navigation'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Admin' }

export default function AdminIndexPage() {
  redirect('/admin/dashboard')
}
