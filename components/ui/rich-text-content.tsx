import { sanitizeRichText } from '@/lib/sanitize-html'

/**
 * RichTextContent — renders editor output safely.
 *
 * Auto-detects format:
 *  • HTML (new content)  → sanitized, then dangerouslySetInnerHTML with prose styles
 *  • Plain text (legacy) → whitespace-pre-wrap, identical to previous behaviour
 */

function isHtml(str: string): boolean {
  return /<[a-z][\s\S]*>/i.test(str?.trim() ?? '')
}

interface Props {
  content: string
  className?: string
}

export function RichTextContent({ content, className }: Props) {
  if (!content) return null

  if (isHtml(content)) {
    return (
      <div
        // Phones: long links/words wrap, wide tables scroll inside the card
        // instead of being cut off, images never exceed the column.
        className={`prose prose-sm max-w-none [overflow-wrap:anywhere] prose-table:block prose-table:overflow-x-auto prose-img:max-w-full prose-a:break-words ${className ?? ''}`}
        dangerouslySetInnerHTML={{ __html: sanitizeRichText(content) }}
      />
    )
  }

  // Legacy plain text — preserve existing display
  return (
    <div className={`whitespace-pre-wrap text-sm leading-relaxed ${className ?? ''}`}>
      {content}
    </div>
  )
}
