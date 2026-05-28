import { redirect } from 'next/navigation'
import { getPublishedDocument } from '@/actions/legal'

export default async function SubProcessorsPage() {
  const doc = await getPublishedDocument('sub-processors')
  if (doc) {
    redirect('/legal/sub-processors')
  }
  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Sub-Processor List</h1>
        <p className="text-gray-500">This document will be available shortly.</p>
      </div>
    </div>
  )
}
