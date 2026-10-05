'use client'

import { useCallback, useState } from 'react'
import Image from 'next/image'
import { canOptimizeImage } from '@/lib/image-src'

/**
 * A team / event logo inside its round or rounded frame. Until the image has
 * loaded the frame is a soft grey placeholder (it used to be a blank white
 * circle — looked broken on a slow connection); once loaded the frame turns
 * white so transparent logos don't sit on a grey disc.
 */
export function LogoImage({
  src, alt, px, frameClassName, style,
}: {
  src: string
  alt: string
  px: number
  frameClassName: string
  style?: React.CSSProperties
}) {
  const [loaded, setLoaded] = useState(false)
  // A cached image can finish before hydration attaches onLoad — catch it.
  const ref = useCallback((img: HTMLImageElement | null) => {
    if (img?.complete && img.naturalWidth > 0) setLoaded(true)
  }, [])
  return (
    // A span (made block), not a div: avatars sit inside <p>, <a> and <button>,
    // where a div is invalid — the HTML parser closes the <p> before it, the
    // server DOM stops matching React's tree, and hydration fails (#418).
    <span className={`block ${frameClassName} ${loaded ? 'bg-white' : 'bg-gray-200 motion-safe:animate-pulse'}`}>
      <Image
        ref={ref}
        src={src}
        alt={alt}
        width={px}
        height={px}
        onLoad={() => setLoaded(true)}
        className="w-full h-full object-cover"
        style={style}
        unoptimized={!canOptimizeImage(src)}
      />
    </span>
  )
}
