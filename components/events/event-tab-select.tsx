'use client'

import { useRouter } from 'next/navigation'

export function EventTabSelect({
  slug,
  tabs,
  activeTab,
}: {
  slug: string
  tabs: { id: string; label: string }[]
  activeTab: string
}) {
  const router = useRouter()

  return (
    <div className="border-b sticky top-16 z-30 bg-white">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3">
        <div className="relative">
          <select
            value={activeTab}
            onChange={(e) => router.push(`/events/${slug}?tab=${e.target.value}`)}
            className="w-full appearance-none bg-white border rounded-lg px-3 py-2.5 pr-8 text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-0"
          >
            {tabs.map((tab) => (
              <option key={tab.id} value={tab.id}>{tab.label}</option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  )
}
