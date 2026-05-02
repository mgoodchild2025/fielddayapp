'use client'

import { useRouter } from 'next/navigation'

interface Props {
  fallbackHref: string
  fallbackLabel: string
}

export function BackLink({ fallbackHref, fallbackLabel }: Props) {
  const router = useRouter()

  function handleClick(e: React.MouseEvent) {
    // If there's a previous page in the session history, go back to it.
    // Otherwise fall through to the <a> tag's normal href navigation.
    if (window.history.length > 1) {
      e.preventDefault()
      router.back()
    }
  }

  return (
    <a
      href={fallbackHref}
      onClick={handleClick}
      className="text-xs opacity-60 hover:opacity-90 transition-opacity"
    >
      ← {fallbackLabel}
    </a>
  )
}
