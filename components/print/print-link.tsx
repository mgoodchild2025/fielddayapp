'use client'

import { useSyncExternalStore } from 'react'
import { isIosStandalone } from '@/lib/print-or-share'

const noSubscribe = () => () => {}

/**
 * A link to a print page. Normally a new tab; in an iPhone home-screen app it
 * opens in place, because a new tab there is an in-app browser that can't
 * print — in place, the page's print button can make a PDF instead.
 */
export function PrintLink({ href, children, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const inPlace = useSyncExternalStore(noSubscribe, isIosStandalone, () => false)
  return (
    <a
      {...rest}
      href={href}
      {...(inPlace ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
    >
      {children}
    </a>
  )
}
