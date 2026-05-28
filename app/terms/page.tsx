import { redirect } from 'next/navigation'
import { getPublishedDocument } from '@/actions/legal'

export default async function TermsPage() {
  const doc = await getPublishedDocument('terms-of-service')
  if (doc) {
    redirect('/legal/terms-of-service')
  }
  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Terms of Service</h1>
        <p className="text-gray-500">This document will be available shortly.</p>
      </div>
    </div>
  )
}
