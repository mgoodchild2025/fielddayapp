import { redirect } from 'next/navigation'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Merchandise' }

export default function MerchandiseSettingsPage() {
  redirect('/admin/shop?tab=items')
}
