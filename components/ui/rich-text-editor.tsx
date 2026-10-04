'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import LinkExtension from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import Image from '@tiptap/extension-image'
import { useEffect, useCallback, useRef, useState } from 'react'
import { Bold, Italic, Underline as UnderlineIcon, List, ListOrdered, Link as LinkIcon, Minus, ImageIcon } from 'lucide-react'
import type { Editor } from '@tiptap/core'
import { uploadContentImage } from '@/actions/content-images'
import { isSafeLinkHref } from '@/lib/sanitize-html'
import { UploadStatus } from '@/components/ui/upload-status'
import { Overlay } from '@/components/ui/overlay'
import { toast } from 'sonner'

interface Props {
  content: string
  onChange: (html: string) => void
  placeholder?: string
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
    // Convert bare \n in text content to <br> — WhatsApp sometimes uses actual
    // newline characters rather than <br> tags; HTML collapses them to spaces
    // without this step. Only applies to text nodes that contain non-whitespace
    // content; pure-whitespace nodes between tags (HTML source formatting) are
    // left alone so they don't produce extra breaks between paragraphs.
    .replace(/>([^<]+)</g, (_, text: string) =>
      /\S/.test(text) ? `>${text.replace(/\n/g, '<br>')}<` : `>${text}<`
    )
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
      data-no-dirty
      onMouseDown={(e) => { e.preventDefault(); onClick() }}
      title={title}
      aria-label={title}
      aria-pressed={active ?? undefined}
      disabled={disabled}
      // 40px on phones (thumbs), 32px with a mouse.
      className={`w-10 h-10 sm:w-8 sm:h-8 flex items-center justify-center rounded transition-colors disabled:opacity-40 ${
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

/**
 * Add / edit / remove a link — an in-app sheet instead of window.prompt
 * (which iOS renders as a tiny system box, and which can't explain a refusal).
 * ProseMirror keeps the selection while the sheet has focus; `focus()` on
 * save puts it back before the link is applied.
 */
function LinkSheet({ editor, open, onClose }: { editor: Editor | null; open: boolean; onClose: () => void }) {
  return (
    <Overlay open={open} onClose={onClose} variant="sheet" labelledBy="rte-link-title"
      panelClassName="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl p-5">
      {open && editor && <LinkSheetBody editor={editor} onClose={onClose} />}
    </Overlay>
  )
}

function LinkSheetBody({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const prev = (editor.getAttributes('link').href as string | undefined) ?? ''
  const [url, setUrl] = useState(prev || 'https://')
  const [error, setError] = useState<string | null>(null)

  function save() {
    const href = url.trim()
    if (!href || href === 'https://') { remove(); return }
    // Defence in depth: the renderer sanitizes too, but a javascript: URL should
    // never reach the database in the first place.
    if (!isSafeLinkHref(href)) {
      setError('Use a web address starting with https://, or a mailto: or tel: link.')
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
    onClose()
  }
  function remove() {
    editor.chain().focus().extendMarkRange('link').unsetLink().run()
    onClose()
  }

  return (
    <div className="space-y-4">
      <h2 id="rte-link-title" className="text-lg font-semibold text-gray-900">{prev ? 'Edit link' : 'Add link'}</h2>
      <div>
        <label htmlFor="rte-link-url" className="block text-sm font-medium text-gray-700 mb-1">Link address</label>
        <input
          id="rte-link-url"
          data-autofocus
          type="url"
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
          value={url}
          onChange={(e) => { setUrl(e.target.value); setError(null) }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save() } }}
          aria-invalid={!!error}
          aria-describedby={error ? 'rte-link-error' : undefined}
          className="w-full min-h-11 border rounded-md px-3 text-base"
        />
        {error && <p id="rte-link-error" role="alert" className="mt-1 text-sm text-red-600">{error}</p>}
      </div>
      <div className="flex items-center gap-2">
        {prev && (
          <button type="button" onClick={remove} className="press min-h-10 px-3 rounded-md text-sm font-medium text-red-600 hover:bg-red-50 mr-auto">
            Remove link
          </button>
        )}
        <button type="button" data-no-dirty onClick={onClose} className={`press min-h-10 px-4 rounded-md text-sm font-medium border text-gray-700 hover:bg-gray-50 ${prev ? '' : 'ml-auto'}`}>
          Cancel
        </button>
        <button type="button" onClick={save} className="press min-h-10 px-5 rounded-md text-sm font-semibold bg-brand-primary text-on-brand">
          {prev ? 'Save link' : 'Add link'}
        </button>
      </div>
    </div>
  )
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
    toast.error(`Couldn't upload ${file.name}`, { description: error ?? 'Please try again.' })
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
  const [uploadingImage, setUploadingImage] = useState<File | null>(null)
  const [linkOpen, setLinkOpen] = useState(false)

  // Wraps insertImage so the toolbar can show an "Uploading…" status while the
  // background upload runs (the inline data-URL preview alone looks finished).
  const uploadImage = useCallback((file: File, ed: Editor) => {
    setUploadingImage(file)
    insertImage(file, ed).finally(() => setUploadingImage(null))
  }, [])

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
        const clipData = event.clipboardData
        if (!clipData) return false
        const items = Array.from(clipData.items)

        const hasHtml = items.some((i) => i.kind === 'string' && i.type === 'text/html')

        // HTML on the clipboard — let transformPastedHTML handle it.
        // This covers Word, WhatsApp web, Google Docs, etc. which all put a
        // rendered image alongside their HTML; returning false means the image
        // is ignored and the richer HTML representation is used instead.
        if (hasHtml) return false

        const plainText = clipData.getData('text/plain')

        // Plain text only (e.g. WhatsApp mobile) with newlines — convert each
        // line to a paragraph so line breaks aren't collapsed by the browser.
        if (plainText && plainText.includes('\n')) {
          event.preventDefault()
          const html = plainText
            .split('\n')
            .map((line) => {
              const escaped = line
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
              return `<p>${escaped || '<br>'}</p>`
            })
            .join('')
          editorRef.current?.commands.insertContent(html)
          return true
        }

        // Single-line plain text — let Tiptap handle it normally.
        if (plainText) return false

        // No text at all — handle pure image paste (screenshots, file drag).
        const imageItem = items.find((i) => i.kind === 'file' && i.type.startsWith('image/'))
        if (!imageItem) return false
        const file = imageItem.getAsFile()
        if (!file || !editorRef.current) return false
        event.preventDefault()
        uploadImage(file, editorRef.current)
        return true
      },
      handleDrop(_, event) {
        const files = Array.from(event.dataTransfer?.files ?? [])
        const imageFile = files.find((f) => f.type.startsWith('image/'))
        if (!imageFile || !editorRef.current) return false
        event.preventDefault()
        uploadImage(imageFile, editorRef.current)
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
    if (file && editor) uploadImage(file, editor)
    e.target.value = '' // reset so same file can be re-selected
  }, [editor, uploadImage])

  return (
    <div
      // No overflow-hidden: it would stop the toolbar sticking while a long
      // description scrolls (the corners are rounded on the parts instead).
      className={`relative border rounded-lg transition-shadow ${
        disabled
          ? 'opacity-60 bg-gray-50'
          : 'focus-within:ring-2 focus-within:ring-brand-primary focus-within:border-brand-primary'
      }`}
    >
      <LinkSheet editor={editor} open={linkOpen} onClose={() => setLinkOpen(false)} />
      {/* Hidden file input for the image toolbar button */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="sr-only"
        onChange={handleFileInput}
      />

      {/* Toolbar */}
      <div className="sticky top-0 z-[1] flex items-center flex-wrap gap-0.5 px-2 py-1.5 border-b bg-gray-50 rounded-t-lg">
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
          onClick={() => setLinkOpen(true)}
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
        <UploadStatus active={!!uploadingImage} label="Uploading image" file={uploadingImage} className="ml-2" />
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
