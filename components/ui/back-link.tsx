import Link from 'next/link'

interface Props {
  fallbackHref: string
  fallbackLabel: string
}

// Previously used router.back() when window.history.length > 1, but that
// condition is almost always true (even fresh tabs have length > 1 after any
// prior browsing) so the link always behaved as a browser-back button instead
// of navigating to the labelled destination.
export function BackLink({ fallbackHref, fallbackLabel }: Props) {
  return (
    <Link
      href={fallbackHref}
      className="text-xs opacity-60 hover:opacity-90 transition-opacity"
    >
      ← {fallbackLabel}
    </Link>
  )
}
