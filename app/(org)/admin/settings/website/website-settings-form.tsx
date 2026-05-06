'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { saveWebsiteSettings } from '@/actions/website'
import Link from 'next/link'

type Theme = 'community' | 'club' | 'pro'

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
    description: 'Clean and membership-focused. Highlights rosters, standings, and sponsors.',
    available: false,
    icon: '🏆',
  },
  {
    id: 'pro',
    label: 'Pro',
    description: 'Bold and competitive. Leads with live standings, leaderboards, and match results.',
    available: false,
    icon: '⚡',
  },
]

interface Props {
  currentTheme: Theme
  orgSlug: string
  heroContent: { headline?: string; subheadline?: string; cta_label?: string; cta_href?: string }
  aboutContent: { title?: string; body?: string }
}

export function WebsiteSettingsForm({ currentTheme, orgSlug, heroContent, aboutContent }: Props) {
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

  async function onSubmit(data: FormData) {
    setLoading(true)
    setSaved(false)
    setSaveError(null)
    const result = await saveWebsiteSettings(data)
    setLoading(false)
    if (result.error) {
      setSaveError(result.error)
    } else {
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }
  }

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

      {/* ── Photos ── */}
      <div className="bg-white rounded-lg border p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Photo Gallery</h2>
            <p className="text-sm text-gray-500 mt-1">
              Upload event and action photos to show on your homepage.
            </p>
          </div>
          <Link
            href="/admin/settings/website/photos"
            className="shrink-0 px-4 py-2 text-sm font-medium border rounded-md hover:bg-gray-50 transition-colors"
          >
            Manage Photos →
          </Link>
        </div>
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
