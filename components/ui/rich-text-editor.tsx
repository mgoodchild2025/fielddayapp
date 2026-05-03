'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import LinkExtension from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import { useEffect } from 'react'
import { Bold, Italic, Underline as UnderlineIcon, List, ListOrdered, Link as LinkIcon, Minus } from 'lucide-react'
import type { Editor } from '@tiptap/core'

interface Props {
  content: string
  onChange: (html: string) => void
  minHeight?: string
  disabled?: boolean
}

// ─── Toolbar helpers ──────────────────────────────────────────────────────────

function ToolbarBtn({
  onClick,
  active,
  title,
  children,
  disabled,
}: {
  onClick: () => void
  active?: boolean
  title: string
  children: React.ReactNode
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      // onMouseDown so the editor doesn't lose focus on click
      onMouseDown={(e) => { e.preventDefault(); onClick() }}
      title={title}
      disabled={disabled}
      className={`w-8 h-8 flex items-center justify-center rounded transition-colors disabled:opacity-40 ${
        active
          ? 'bg-gray-200 text-gray-900'
          : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
      }`}
    >
      {children}
    </button>
  )
}

function Sep() {
  return <span className="w-px h-4 bg-gray-200 mx-0.5 shrink-0" aria-hidden />
}

function promptLink(editor: Editor) {
  const prev = editor.getAttributes('link').href as string | undefined
  const url = window.prompt('Link URL', prev ?? 'https://')
  if (url === null) return // cancelled
  if (!url) {
    editor.chain().focus().extendMarkRange('link').unsetLink().run()
    return
  }
  editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
}

// ─── Editor ───────────────────────────────────────────────────────────────────

export function RichTextEditor({ content, onChange, minHeight = '220px', disabled }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      LinkExtension.configure({
        openOnClick: false,
        HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' },
      }),
      Underline,
    ],
    content: content || '<p></p>',
    editorProps: {
      attributes: {
        // prose styles apply inside the editor for a live preview
        class: 'prose prose-sm max-w-none focus:outline-none',
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML()
      // Tiptap emits '<p></p>' for a blank doc — normalise to empty string
      onChange(html === '<p></p>' ? '' : html)
    },
    editable: !disabled,
    immediatelyRender: false,
  })

  // Sync when content is changed externally (e.g. template auto-fill)
  useEffect(() => {
    if (!editor) return
    const normalized = content || '<p></p>'
    if (editor.getHTML() !== normalized) {
      editor.commands.setContent(normalized)
    }
  }, [content, editor])

  return (
    <div
      className={`border rounded-lg overflow-hidden transition-shadow ${
        disabled
          ? 'opacity-60 bg-gray-50'
          : 'focus-within:ring-2 focus-within:ring-orange-400 focus-within:border-orange-400'
      }`}
    >
      {/* Toolbar */}
      <div className="flex items-center flex-wrap gap-0.5 px-2 py-1.5 border-b bg-gray-50">
        {/* Text style */}
        <ToolbarBtn
          onClick={() => editor?.chain().focus().toggleBold().run()}
          active={editor?.isActive('bold')}
          title="Bold"
          disabled={!editor || disabled}
        >
          <Bold className="w-3.5 h-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          active={editor?.isActive('italic')}
          title="Italic"
          disabled={!editor || disabled}
        >
          <Italic className="w-3.5 h-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
          active={editor?.isActive('underline')}
          title="Underline"
          disabled={!editor || disabled}
        >
          <UnderlineIcon className="w-3.5 h-3.5" />
        </ToolbarBtn>

        <Sep />

        {/* Headings */}
        <ToolbarBtn
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor?.isActive('heading', { level: 2 })}
          title="Heading 2"
          disabled={!editor || disabled}
        >
          <span className="text-[11px] font-bold leading-none">H2</span>
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
          active={editor?.isActive('heading', { level: 3 })}
          title="Heading 3"
          disabled={!editor || disabled}
        >
          <span className="text-[11px] font-bold leading-none">H3</span>
        </ToolbarBtn>

        <Sep />

        {/* Lists */}
        <ToolbarBtn
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          active={editor?.isActive('bulletList')}
          title="Bullet list"
          disabled={!editor || disabled}
        >
          <List className="w-3.5 h-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          active={editor?.isActive('orderedList')}
          title="Numbered list"
          disabled={!editor || disabled}
        >
          <ListOrdered className="w-3.5 h-3.5" />
        </ToolbarBtn>

        <Sep />

        {/* Link & rule */}
        <ToolbarBtn
          onClick={() => editor && promptLink(editor)}
          active={editor?.isActive('link')}
          title={editor?.isActive('link') ? 'Edit or remove link' : 'Add link'}
          disabled={!editor || disabled}
        >
          <LinkIcon className="w-3.5 h-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor?.chain().focus().setHorizontalRule().run()}
          title="Horizontal rule"
          disabled={!editor || disabled}
        >
          <Minus className="w-3.5 h-3.5" />
        </ToolbarBtn>
      </div>

      {/* Editable area */}
      <EditorContent
        editor={editor}
        className="px-3 py-2 text-sm text-gray-900"
        style={{ minHeight }}
      />
    </div>
  )
}
