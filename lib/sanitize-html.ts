import DOMPurify from 'isomorphic-dompurify'

// Sanitizer for rich-text content authored in the app's WYSIWYG editor.
//
// Editor output is stored as raw HTML and rendered with dangerouslySetInnerHTML
// on public event pages, rules and format tabs, waiver signing, guest
// registration and the printed waiver record. Anyone who can author that
// content could otherwise run script in every viewer's browser, so the HTML is
// sanitized at the point of render — the one place every path goes through.

/** Tags the editor can actually produce. Anything else is dropped. */
const ALLOWED_TAGS = [
  'p', 'br', 'hr', 'span', 'div',
  'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'sub', 'sup', 'mark',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li',
  'blockquote', 'pre', 'code',
  'a', 'img',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
]

const ALLOWED_ATTR = [
  'href', 'target', 'rel', 'title',
  'src', 'alt', 'width', 'height',
  'colspan', 'rowspan', 'class',
]

/** Schemes permitted in a link target. */
const LINK_SCHEMES = ['http', 'https', 'mailto', 'tel']

/** Raster data images the editor may legitimately hold mid-upload. SVG is
 *  excluded deliberately — it can carry script. */
const SAFE_DATA_IMAGE = /^data:image\/(png|jpeg|jpg|gif|webp);/i

function schemeOf(url: string): string | null {
  const m = /^([a-z][a-z0-9+.-]*):/i.exec(url.trim())
  return m ? m[1].toLowerCase() : null
}

/**
 * Returns true when a URL is safe to store as a link target.
 * Used by the editor at author time, so bad input never reaches the database.
 * A relative or fragment link carries no scheme and is always fine.
 */
export function isSafeLinkHref(url: string): boolean {
  const trimmed = url.trim()
  if (!trimmed) return false
  const scheme = schemeOf(trimmed)
  if (!scheme) return true
  return LINK_SCHEMES.includes(scheme)
}

/**
 * Image sources additionally allow raster data URLs, because the editor
 * inserts one as a preview while the real upload is still in flight.
 */
export function isSafeImageSrc(url: string): boolean {
  const trimmed = url.trim()
  if (!trimmed) return false
  const scheme = schemeOf(trimmed)
  if (!scheme) return true
  if (scheme === 'data') return SAFE_DATA_IMAGE.test(trimmed)
  return LINK_SCHEMES.includes(scheme)
}

// DOMPurify permits data: URLs on media tags regardless of ALLOWED_URI_REGEXP,
// so the scheme rules above are enforced in a hook instead of by config.
let hookInstalled = false
function installHook() {
  if (hookInstalled) return
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    const el = node as unknown as {
      getAttribute?: (n: string) => string | null
      removeAttribute?: (n: string) => void
    }
    if (!el.getAttribute || !el.removeAttribute) return
    const href = el.getAttribute('href')
    if (href !== null && !isSafeLinkHref(href)) el.removeAttribute('href')
    const src = el.getAttribute('src')
    if (src !== null && !isSafeImageSrc(src)) el.removeAttribute('src')
  })
  hookInstalled = true
}

/** Strip scripts, event handlers and unsafe URL schemes from editor HTML. */
export function sanitizeRichText(html: string): string {
  if (!html) return ''
  installHook()
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // Keep the text of a stripped tag rather than deleting the content with it.
    KEEP_CONTENT: true,
  })
}
