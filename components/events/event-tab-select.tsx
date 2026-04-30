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
    <div className="border-b sticky top-16 z-30 bg-white shadow-sm">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 shrink-0">Section</span>
          <div className="relative flex-1">
            <select
              value={activeTab}
              onChange={(e) => router.push(`/events/${slug}?tab=${e.target.value}`)}
              className="w-full appearance-none bg-white border border-gray-300 rounded-lg px-3 py-2 pr-8 text-sm font-medium text-gray-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-0 cursor-pointer"
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
    </div>
  )
}
