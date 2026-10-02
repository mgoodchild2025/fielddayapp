// Route-level loading placeholder (used by loading.tsx files).
//
// Next.js shows loading.tsx the instant a link is tapped, while the server
// renders the page — without one, a tap on gym wifi does nothing visible for
// a second or more. Org pages render their own OrgNav, so the skeleton paints
// an identical bar first: the nav stays put and only the content below it
// shimmers. The shapes roughly match each page so the real content lands
// where the eye already is.

type Variant = 'dashboard' | 'list' | 'detail' | 'table'

const Bar = ({ className = '' }: { className?: string }) => (
  <div className={`rounded-md bg-gray-200/80 ${className}`} />
)

export function PageSkeleton({ variant, label }: { variant: Variant; label: string }) {
  return (
    <div className="min-h-dvh" style={{ backgroundColor: 'var(--brand-bg)' }}>
      {/* Same height and colour as OrgNav, so navigation doesn't blink. */}
      <div className="sticky top-0 z-40 h-14 border-b border-white/10" style={{ backgroundColor: 'var(--brand-secondary)' }} />

      {/* Only the placeholder shapes pulse — never the brand-coloured bands,
          which would fade to grey. */}
      <div aria-hidden="true">
        {variant === 'dashboard' && (
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6 motion-safe:animate-pulse">
            <div className="space-y-2">
              <Bar className="h-3 w-28" />
              <Bar className="h-7 w-56" />
            </div>
            <Bar className="h-48 rounded-2xl" />
            <div className="space-y-3">
              <Bar className="h-4 w-32" />
              <Bar className="h-20 rounded-xl" />
              <Bar className="h-20 rounded-xl" />
            </div>
          </div>
        )}

        {variant === 'list' && (
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-4 motion-safe:animate-pulse">
            <Bar className="h-8 w-48" />
            <div className="flex gap-2">
              <Bar className="h-9 w-24 rounded-full" />
              <Bar className="h-9 w-24 rounded-full" />
            </div>
            {['a', 'b', 'c', 'd', 'e'].map((k) => (
              <Bar key={k} className="h-24 rounded-xl" />
            ))}
          </div>
        )}

        {variant === 'detail' && (
          <>
            <div className="h-36" style={{ backgroundColor: 'var(--brand-secondary)' }}>
              <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-6 space-y-3 motion-safe:animate-pulse">
                <div className="h-3 w-24 rounded bg-white/20" />
                <div className="h-8 w-2/3 rounded bg-white/25" />
                <div className="h-4 w-1/3 rounded bg-white/20" />
              </div>
            </div>
            <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-4 motion-safe:animate-pulse">
              <div className="flex gap-3">
                {['a', 'b', 'c'].map((k) => <Bar key={k} className="h-9 w-24" />)}
              </div>
              {['a', 'b', 'c', 'd'].map((k) => (
                <Bar key={k} className="h-20 rounded-xl" />
              ))}
            </div>
          </>
        )}

        {variant === 'table' && (
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-4 motion-safe:animate-pulse">
            <Bar className="h-8 w-40" />
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <div className="h-10 bg-gray-100" />
              {['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((k) => (
                <div key={k} className="h-12 border-t border-gray-100 px-4 flex items-center gap-4">
                  <Bar className="h-3 w-6" />
                  <Bar className="h-3 flex-1 max-w-48" />
                  <Bar className="h-3 w-10 ml-auto" />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <p className="sr-only" role="status">{label}</p>
    </div>
  )
}
