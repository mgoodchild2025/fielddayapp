'use client'

import { useState, useRef, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { saveWebsiteSettings } from '@/actions/website'
import Link from 'next/link'

type Theme = 'community' | 'club' | 'pro'
type SectionItem = { key: string; label: string; visible: boolean }

const schema = z.object({
  site_theme: z.enum(['community', 'club', 'pro']),
  hero_headline: z.string().max(120).optional(),
  hero_subheadline: z.string().max(200).optional(),
  hero_cta_label: z.string().max(40).optional(),
  hero_cta_href: z.string().max(200).optional(),
  about_title: z.string().max(80).optional(),
  about_body: z.string().max(2000).optional(),
})
type FormData = z.infer<typeof schema>

const THEMES: { id: Theme; label: string; description: string; available: boolean; icon: string }[] = [
  {
    id: 'community',
    label: 'Community',
    description: 'Warm and welcoming. Great for rec leagues, community groups, and neighbourhood sports.',
    available: true,
    icon: '🏘️',
  },
  {
    id: 'club',
    label: 'Club',
    description: 'Clean and membership-focused. Highlights events, standings, and sponsors with a structured layout.',
    available: true,
    icon: '🏆',
  },
  {
    id: 'pro',
    label: 'Pro',
    description: 'Bold and competitive. Dark hero, recent match results, and tiered sponsor section.',
    available: true,
    icon: '⚡',
  },
]

// Sections available per theme (hero is always pinned first and not shown here)
const THEME_SECTIONS: Record<Theme, SectionItem[]> = {
  community: [
    { key: 'events',   label: 'Events (Open & In Season)', visible: true },
    { key: 'about',    label: 'About',                     visible: true },
    { key: 'staff',    label: 'Meet the Team',             visible: true },
    { key: 'photos',   label: 'Photo Gallery',             visible: true },
  ],
  club: [
    { key: 'events',   label: 'Events (Open & In Season)', visible: true },
    { key: 'about',    label: 'About',                     visible: true },
    { key: 'staff',    label: 'Our Team',                  visible: true },
    { key: 'sponsors', label: 'Sponsors',                  visible: true },
  ],
  pro: [
    { key: 'results',  label: 'Recent Results',            visible: true },
    { key: 'events',   label: 'Events & Active Leagues',   visible: true },
    { key: 'staff',    label: 'The Team',                  visible: true },
    { key: 'sponsors', label: 'Sponsors',                  visible: true },
  ],
}

/** Merge stored order/visibility with theme defaults.
 *  - Use stored order for keys that exist in both
 *  - Append any new defaults not yet in stored
 *  - Drop keys from stored that don't belong to this theme */
function resolveLayout(
  stored: { key: string; visible: boolean }[] | null,
  theme: Theme
): SectionItem[] {
  const defaults = THEME_SECTIONS[theme]
  if (!stored || stored.length === 0) return defaults.map(s => ({ ...s }))

  const result: SectionItem[] = []
  // Stored order, filtered to valid keys for this theme
  for (const s of stored) {
    const def = defaults.find(d => d.key === s.key)
    if (def) result.push({ ...def, visible: s.visible })
  }
  // Append any new defaults not in stored
  for (const def of defaults) {
    if (!result.find(r => r.key === def.key)) {
      result.push({ ...def })
    }
  }
  return result
}

interface Props {
  currentTheme: Theme
  orgSlug: string
  heroContent: { headline?: string; subheadline?: string; cta_label?: string; cta_href?: string }
  aboutContent: { title?: string; body?: string }
  savedSections: { key: string; visible: boolean }[] | null
}

export function WebsiteSettingsForm({ currentTheme, orgSlug, heroContent, aboutContent, savedSections }: Props) {
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, watch, setValue } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      site_theme: currentTheme,
      hero_headline: heroContent.headline ?? '',
      hero_subheadline: heroContent.subheadline ?? '',
      hero_cta_label: heroContent.cta_label ?? '',
      hero_cta_href: heroContent.cta_href ?? '',
      about_title: aboutContent.title ?? '',
      about_body: aboutContent.body ?? '',
    },
  })

  const selectedTheme = watch('site_theme')
  const aboutBody = watch('about_body') ?? ''

  // Section layout state — re-initialise when theme changes
  const [sections, setSections] = useState<SectionItem[]>(() =>
    resolveLayout(savedSections, currentTheme)
  )
  const prevTheme = useRef(selectedTheme)
  useEffect(() => {
    if (selectedTheme !== prevTheme.current) {
      // Carry over visibility preferences for keys shared between themes
      const next = resolveLayout(
        sections.map(s => ({ key: s.key, visible: s.visible })),
        selectedTheme
      )
      setSections(next)
      prevTheme.current = selectedTheme
    }
  }, [selectedTheme, sections])

  // ── Drag-to-reorder ──────────────────────────────────────────────────────
  const dragKey = useRef<string | null>(null)
  const [dragOverKey, setDragOverKey] = useState<string | null>(null)

  function handleDragStart(key: string) {
    dragKey.current = key
  }
  function handleDragOver(e: React.DragEvent, key: string) {
    e.preventDefault()
    if (dragKey.current && dragKey.current !== key) setDragOverKey(key)
  }
  function handleDrop(targetKey: string) {
    const fromKey = dragKey.current
    if (!fromKey || fromKey === targetKey) { dragKey.current = null; setDragOverKey(null); return }
    const from = sections.findIndex(s => s.key === fromKey)
    const to   = sections.findIndex(s => s.key === targetKey)
    const reordered = [...sections]
    const [moved] = reordered.splice(from, 1)
    reordered.splice(to, 0, moved)
    setSections(reordered)
    dragKey.current = null
    setDragOverKey(null)
  }
  function handleDragEnd() {
    dragKey.current = null
    setDragOverKey(null)
  }

  function toggleVisible(key: string) {
    setSections(prev => prev.map(s => s.key === key ? { ...s, visible: !s.visible } : s))
  }

  async function onSubmit(data: FormData) {
    setLoading(true)
    setSaved(false)
    setSaveError(null)
    const result = await saveWebsiteSettings({
      ...data,
      sections: sections.map(s => ({ key: s.key, visible: s.visible })),
    })
    setLoading(false)
    if (result.error) {
      setSaveError(result.error)
    } else {
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }
  }

  void orgSlug // available for future use (preview link)

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {saved && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded text-sm">
          Website settings saved.
        </div>
      )}
      {saveError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
          {saveError}
        </div>
      )}

      {/* ── Theme Picker ── */}
      <div className="bg-white rounded-lg border p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Site Theme</h2>
          <Link href="/" target="_blank" className="text-xs text-blue-600 hover:underline">
            Preview public site ↗
          </Link>
        </div>
        <p className="text-sm text-gray-500">Choose the look and feel for your public-facing site.</p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {THEMES.map((theme) => {
            const isSelected = selectedTheme === theme.id
            return (
              <button
                key={theme.id}
                type="button"
                disabled={!theme.available}
                onClick={() => theme.available && setValue('site_theme', theme.id, { shouldDirty: true })}
                className={[
                  'relative text-left rounded-xl border-2 p-4 transition-all',
                  theme.available ? 'cursor-pointer' : 'cursor-not-allowed opacity-60',
                  isSelected ? 'border-orange-400 bg-orange-50' : 'border-gray-200 bg-white hover:border-gray-300',
                ].join(' ')}
              >
                {!theme.available && (
                  <span className="absolute top-2 right-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 uppercase tracking-wide">
                    Coming soon
                  </span>
                )}
                {isSelected && (
                  <span className="absolute top-2 right-2 w-4 h-4 rounded-full bg-orange-400 flex items-center justify-center">
                    <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 12 12">
                      <path d="M10 3L5 8.5 2 5.5l-1 1 4 4 6-7-1-1z" />
                    </svg>
                  </span>
                )}
                <div className="text-2xl mb-2">{theme.icon}</div>
                <p className="font-semibold text-sm">{theme.label}</p>
                <p className="text-xs text-gray-500 mt-1 leading-snug">{theme.description}</p>
              </button>
            )
          })}
        </div>
        <input type="hidden" {...register('site_theme')} />
      </div>

      {/* ── Page Sections ── */}
      <div className="bg-white rounded-lg border p-5 space-y-4">
        <div>
          <h2 className="font-semibold">Page Sections</h2>
          <p className="text-sm text-gray-500 mt-1">
            Drag to reorder · toggle the eye to show or hide each section.
            The <span className="font-medium text-gray-700">Hero</span> is always pinned at the top.
          </p>
        </div>

        <div className="space-y-1.5">
          {/* Hero — always pinned, not draggable */}
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-gray-100 bg-gray-50 select-none">
            <span className="text-gray-300 w-4 text-center text-lg leading-none">⠿</span>
            <span className="flex-1 text-sm font-medium text-gray-400">Hero (always first)</span>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-200 text-gray-400 uppercase tracking-wide">Pinned</span>
          </div>

          {sections.map((section) => (
            <div
              key={section.key}
              draggable
              onDragStart={() => handleDragStart(section.key)}
              onDragOver={(e) => handleDragOver(e, section.key)}
              onDrop={() => handleDrop(section.key)}
              onDragEnd={handleDragEnd}
              className={[
                'flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all cursor-grab active:cursor-grabbing select-none',
                dragOverKey === section.key
                  ? 'border-orange-300 bg-orange-50 shadow-sm'
                  : 'border-gray-200 bg-white hover:border-gray-300',
                !section.visible ? 'opacity-50' : '',
              ].join(' ')}
            >
              {/* Drag handle */}
              <span className="text-gray-400 w-4 text-center text-lg leading-none">⠿</span>

              {/* Label */}
              <span className={`flex-1 text-sm font-medium ${section.visible ? 'text-gray-700' : 'text-gray-400 line-through'}`}>
                {section.label}
              </span>

              {/* Visibility toggle */}
              <button
                type="button"
                onClick={() => toggleVisible(section.key)}
                title={section.visible ? 'Hide section' : 'Show section'}
                className="text-gray-400 hover:text-gray-700 transition-colors p-1 rounded"
              >
                {section.visible ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                  </svg>
                )}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ── Hero Section ── */}
      <div className="bg-white rounded-lg border p-5 space-y-4">
        <h2 className="font-semibold">Hero Section</h2>
        <p className="text-sm text-gray-500">
          The large banner at the top of your homepage. Leave fields blank to use defaults.
        </p>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Headline</label>
            <input
              {...register('hero_headline')}
              type="text"
              placeholder="e.g. Ottawa Summer Volleyball"
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
            <p className="text-xs text-gray-400 mt-1">Defaults to your org name if blank.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sub-headline</label>
            <input
              {...register('hero_subheadline')}
              type="text"
              placeholder="e.g. Competitive and recreational leagues for all levels"
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
            <p className="text-xs text-gray-400 mt-1">Defaults to your tagline from Branding settings if blank.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">CTA Button Label</label>
              <input
                {...register('hero_cta_label')}
                type="text"
                placeholder="View Events"
                className="w-full border rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">CTA Button Link</label>
              <input
                {...register('hero_cta_href')}
                type="text"
                placeholder="/events"
                className="w-full border rounded-md px-3 py-2 text-sm font-mono"
              />
              <p className="text-xs text-gray-400 mt-1">Path like <code>/events</code> or a full URL.</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── About Section ── */}
      <div className="bg-white rounded-lg border p-5 space-y-4">
        <div>
          <h2 className="font-semibold">About Section</h2>
          <p className="text-sm text-gray-500 mt-1">
            An optional section below the hero that tells your org&apos;s story. Leave blank to hide it.
          </p>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Section Title</label>
            <input
              {...register('about_title')}
              type="text"
              placeholder="About Us"
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Body Text</label>
            <textarea
              {...register('about_body')}
              rows={5}
              placeholder="Tell players and visitors who you are, what sports you offer, and what makes your league great…"
              className="w-full border rounded-md px-3 py-2 text-sm resize-y"
            />
            <p className="text-xs text-gray-400 mt-1">{aboutBody.length} / 2000 characters</p>
          </div>
        </div>
      </div>

      {/* ── Content sub-pages ── */}
      <div className="bg-white rounded-lg border divide-y">
        {[
          { href: '/admin/settings/website/photos',   label: 'Photo Gallery',      desc: 'Upload event and action photos.' },
          { href: '/admin/settings/website/sponsors',  label: 'Sponsors',           desc: 'Add sponsor logos with tier levels (Gold, Silver, Bronze).' },
          { href: '/admin/settings/website/staff',     label: 'Staff & Volunteers', desc: 'Feature the people who run your league.' },
        ].map(({ href, label, desc }) => (
          <div key={href} className="flex items-center justify-between px-5 py-4">
            <div>
              <p className="font-semibold text-sm">{label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
            </div>
            <Link href={href} className="shrink-0 px-4 py-2 text-sm font-medium border rounded-md hover:bg-gray-50 transition-colors">
              Manage →
            </Link>
          </div>
        ))}
      </div>

      <button
        type="submit"
        disabled={loading}
        className="px-6 py-2.5 rounded-md font-semibold text-white disabled:opacity-60"
        style={{ backgroundColor: 'var(--brand-primary)' }}
      >
        {loading ? 'Saving…' : 'Save Website Settings'}
      </button>
    </form>
  )
}
