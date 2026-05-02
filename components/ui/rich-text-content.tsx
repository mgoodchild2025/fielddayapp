/**
 * RichTextContent — renders editor output safely.
 *
 * Auto-detects format:
 *  • HTML (new content)  → dangerouslySetInnerHTML with prose styles
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
        className={`prose prose-sm max-w-none ${className ?? ''}`}
        dangerouslySetInnerHTML={{ __html: content }}
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
