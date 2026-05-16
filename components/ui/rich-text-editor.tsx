'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import LinkExtension from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import Image from '@tiptap/extension-image'
import { useEffect, useCallback, useRef } from 'react'
import { Bold, Italic, Underline as UnderlineIcon, List, ListOrdered, Link as LinkIcon, Minus, ImageIcon } from 'lucide-react'
import type { Editor } from '@tiptap/core'
import { uploadContentImage } from '@/actions/content-images'

interface Props {
  content: string
  onChange: (html: string) => void
  minHeight?: string
  disabled?: boolean
}

// ─── Word HTML cleanup ────────────────────────────────────────────────────────
// Normalises the messy HTML Word/Google Docs puts on the clipboard so Tiptap
// ends up with clean semantic markup (headings, lists, bold, etc.)

function cleanPastedHtml(html: string): string {
  return html
    // Remove XML processing instructions and namespaced tags (MSO, VML, etc.)
    .replace(/<\?xml[^>]*>/gi, '')
    .replace(/<\/?o:[^>]*>/gi, '')
    .replace(/<\/?w:[^>]*>/gi, '')
    .replace(/<\/?m:[^>]*>/gi, '')
    .replace(/<\/?v:[^>]*>/gi, '')
    // Strip HTML comments (Word embeds conditional comments with styles)
    .replace(/<!--[\s\S]*?-->/g, '')
    // Strip <style> and <meta> blocks Word includes in the fragment
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<meta[^>]*>/gi, '')
    // Strip contenteditable attributes — WhatsApp web sets these on internal
    // elements, and ProseMirror honours them, making pasted text non-editable
    .replace(/\s*contenteditable="[^"]*"/gi, '')
    // Strip data-* attributes (WhatsApp, Slack, etc. embed internal keys)
    .replace(/\s*data-[\w-]+=(?:"[^"]*"|'[^']*')/gi, '')
    // Convert <div> → <p> so WhatsApp/Slack block-level content maps to
    // paragraph nodes that StarterKit understands
    .replace(/<div(\s[^>]*)?>/gi, '<p>')
    .replace(/<\/div>/gi, '</p>')
    // H1 → H2 (we only expose H2/H3 in the toolbar)
    .replace(/<h1(\s[^>]*)?>/gi, '<h2$1>')
    .replace(/<\/h1>/gi, '</h2>')
    // H4–H6 → H3
    .replace(/<h[4-6](\s[^>]*)?>/gi, '<h3$1>')
    .replace(/<\/h[4-6]>/gi, '</h3>')
    // Word wraps everything in <p class="MsoNormal"> — keep the <p>, drop the class
    .replace(/<p\s+class="Mso[^"]*"([^>]*)>/gi, '<p$1>')
    // Strip class/style/id on spans (Word, WhatsApp inject these with no semantic value)
    .replace(/<span\s[^>]*>/gi, '<span>')
    // Collapse runs of empty paragraphs that Word pads between real content
    .replace(/(<p[^>]*>\s*(?:<br\s*\/?>\s*)*<\/p>\s*){3,}/gi, '<p></p>')
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
  if (url === null) return
  if (!url) {
    editor.chain().focus().extendMarkRange('link').unsetLink().run()
    return
  }
  editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
}

// ─── Image upload helper ──────────────────────────────────────────────────────
// Inserts a data-URL preview immediately, uploads in the background, then
// swaps the src to the permanent Supabase URL once the upload completes.

async function insertImage(file: File, editor: Editor) {
  if (!file.type.startsWith('image/')) return

  // 1. Show a preview straight away using the data URL
  const dataUrl = await new Promise<string>((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target!.result as string)
    reader.readAsDataURL(file)
  })

  editor.chain().focus().setImage({ src: dataUrl, alt: file.name }).run()

  // 2. Upload to storage in the background
  const fd = new FormData()
  fd.append('file', file)
  const { url, error } = await uploadContentImage(fd)

  if (error || !url) {
    // Upload failed — remove the placeholder image so the user isn't left with a broken base64 blob
    editor.commands.command(({ tr, state }) => {
      state.doc.descendants((node, pos) => {
        if (node.type.name === 'image' && node.attrs.src === dataUrl) {
          tr.delete(pos, pos + node.nodeSize)
        }
      })
      return true
    })
    return
  }

  // 3. Replace the data-URL src with the permanent URL
  editor.commands.command(({ tr, state }) => {
    state.doc.descendants((node, pos) => {
      if (node.type.name === 'image' && node.attrs.src === dataUrl) {
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, src: url })
      }
    })
    return true
  })
}

// ─── Editor ───────────────────────────────────────────────────────────────────

export function RichTextEditor({ content, onChange, minHeight = '220px', disabled }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const editorRef = useRef<Editor | null>(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      LinkExtension.configure({
        openOnClick: false,
        HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' },
      }),
      Underline,
      Image.configure({
        inline: false,
        allowBase64: true, // allow data URLs while upload is in progress
        HTMLAttributes: { class: 'max-w-full rounded my-2' },
      }),
    ],
    content: content || '<p></p>',
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none',
      },
      // Clean up Word/Google Docs HTML before Tiptap parses it
      transformPastedHTML: cleanPastedHtml,
      handlePaste(_, event) {
        const items = Array.from(event.clipboardData?.items ?? [])
        const imageItem = items.find((i) => i.kind === 'file' && i.type.startsWith('image/'))
        if (!imageItem) return false
        const file = imageItem.getAsFile()
        if (!file || !editorRef.current) return false
        event.preventDefault()
        insertImage(file, editorRef.current)
        return true
      },
      handleDrop(_, event) {
        const files = Array.from(event.dataTransfer?.files ?? [])
        const imageFile = files.find((f) => f.type.startsWith('image/'))
        if (!imageFile || !editorRef.current) return false
        event.preventDefault()
        insertImage(imageFile, editorRef.current)
        return true
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML()
      onChange(html === '<p></p>' ? '' : html)
    },
    editable: !disabled,
    immediatelyRender: false,
  })

  // Keep the ref in sync so paste/drop handlers can access the latest editor
  useEffect(() => { editorRef.current = editor ?? null }, [editor])

  // Sync when content is changed externally (e.g. template auto-fill)
  useEffect(() => {
    if (!editor) return
    const normalized = content || '<p></p>'
    if (editor.getHTML() !== normalized) {
      editor.commands.setContent(normalized)
    }
  }, [content, editor])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && editor) insertImage(file, editor)
    e.target.value = '' // reset so same file can be re-selected
  }, [editor])

  return (
    <div
      className={`border rounded-lg overflow-hidden transition-shadow ${
        disabled
          ? 'opacity-60 bg-gray-50'
          : 'focus-within:ring-2 focus-within:ring-orange-400 focus-within:border-orange-400'
      }`}
    >
      {/* Hidden file input for the image toolbar button */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="sr-only"
        onChange={handleFileInput}
      />

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

        {/* Link, rule, image */}
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
        <ToolbarBtn
          onClick={() => fileInputRef.current?.click()}
          title="Insert image"
          disabled={!editor || disabled}
        >
          <ImageIcon className="w-3.5 h-3.5" />
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
