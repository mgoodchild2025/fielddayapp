import { redirect } from 'next/navigation'
import { getPublishedDocument } from '@/actions/legal'

export default async function PrivacyPage() {
  const doc = await getPublishedDocument('privacy-policy')
  if (doc) {
    redirect('/legal/privacy-policy')
  }
  // Not yet published — show placeholder
  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
        <p className="text-gray-500">This document will be available shortly.</p>
      </div>
    </div>
  )
}
