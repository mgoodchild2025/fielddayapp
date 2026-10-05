'use client'

import { startTransition, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * The TV has nobody standing at it: a failed render must not leave a dead
 * "Something went wrong" page up all evening. Show a quiet reconnecting card
 * and keep retrying until the display comes back.
 */
export default function DisplayError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter()
  const [tries, setTries] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      setTries((t) => t + 1)
      startTransition(() => {
        router.refresh()
        reset()
      })
    }, 20_000)
    return () => clearInterval(id)
  }, [router, reset])

  return (
    <div className="min-h-dvh flex items-center justify-center bg-zinc-950 text-white">
      <div className="text-center space-y-3">
        <div className="mx-auto w-10 h-10 rounded-full border-2 border-white/20 border-t-white motion-safe:animate-spin" aria-hidden="true" />
        <p className="text-2xl font-semibold">Reconnecting…</p>
        <p className="text-white/70">The display will come back on its own{tries > 0 ? ` (try ${tries + 1})` : ''}.</p>
      </div>
    </div>
  )
}
