import { getInlineFontCss, googleFontsUrl } from '@/lib/google-fonts'

/**
 * The org's heading + body fonts. Inlined @font-face CSS when available (no
 * render-blocking stylesheet request — see lib/google-fonts.ts), else the
 * Google Fonts <link> as before.
 */
export function BrandFonts({ headingFont, bodyFont }: { headingFont: string; bodyFont: string }) {
  const css = getInlineFontCss(headingFont, bodyFont)
  return (
    <>
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      {css
        ? <style dangerouslySetInnerHTML={{ __html: css }} />
        : (
          <>
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link href={googleFontsUrl(headingFont, bodyFont)} rel="stylesheet" />
          </>
        )}
    </>
  )
}
