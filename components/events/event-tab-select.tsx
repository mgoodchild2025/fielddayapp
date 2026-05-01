import Link from 'next/link'

export function EventTabSelect({
  slug,
  tabs,
  activeTab,
}: {
  slug: string
  tabs: { id: string; label: string }[]
  activeTab: string
}) {
  return (
    <div className="border-b sticky top-14 z-30 bg-white shadow-sm">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3">
        <div className="flex gap-2 flex-wrap">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <Link
                key={tab.id}
                href={`/events/${slug}?tab=${tab.id}`}
                className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors whitespace-nowrap ${
                  isActive
                    ? 'text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                style={isActive ? { backgroundColor: 'var(--brand-primary)' } : {}}
              >
                {tab.label}
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
