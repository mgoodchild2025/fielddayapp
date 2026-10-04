import { redirect } from 'next/navigation'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Website photos' }

export default function PhotosPage() {
  redirect('/admin/gallery')
}
