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
      className="press inline-flex items-center min-h-10 -ml-1 px-1 text-sm text-gray-500 hover:text-gray-800"
    >
      ← {fallbackLabel}
    </Link>
  )
}
