'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html>
      <body>
        <div style={{ fontFamily: 'sans-serif', maxWidth: 480, margin: '80px auto', padding: '0 24px', textAlign: 'center' }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ color: '#666', marginBottom: 24 }}>{error.message || 'An unexpected error occurred.'}</p>
          <button
            onClick={reset}
            style={{ padding: '10px 20px', background: '#000', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
