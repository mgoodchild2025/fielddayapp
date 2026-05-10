import { redirect } from 'next/navigation'

export default function MerchandiseSettingsPage() {
  redirect('/admin/shop?tab=items')
}
