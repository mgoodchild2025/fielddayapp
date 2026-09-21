// The event page loads a lot before it can render, and until now that wait was
// a blank screen with no feedback — there was no loading.tsx anywhere in the
// app. This gives the navigation something to paint immediately.
export default function Loading() {
  return (
    <div className="min-h-dvh" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <div className="max-w-5xl mx-auto px-4 py-8 animate-pulse" aria-hidden="true">
        <div className="h-8 w-2/3 rounded bg-gray-200" />
        <div className="mt-3 h-4 w-1/3 rounded bg-gray-200" />

        <div className="mt-8 flex gap-2">
          {['a', 'b', 'c', 'd'].map((k) => (
            <div key={k} className="h-9 w-24 rounded-md bg-gray-200" />
          ))}
        </div>

        <div className="mt-6 space-y-3">
          {['r1', 'r2', 'r3', 'r4', 'r5'].map((k) => (
            <div key={k} className="h-16 rounded-lg bg-gray-200" />
          ))}
        </div>
      </div>
      <p className="sr-only" role="status">Loading event…</p>
    </div>
  )
}
