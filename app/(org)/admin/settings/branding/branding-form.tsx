'use client'

import { useState, useRef, useTransition } from 'react'
import Image from 'next/image'
import { useForm, useController, Control, FieldErrors } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { updateBranding, uploadOrgLogo } from '@/actions/branding'
import { FontPicker, HEADING_FONTS, BODY_FONTS } from '@/components/branding/font-picker'
import type { Database } from '@/types/database'

type OrgBranding = Database['public']['Tables']['org_branding']['Row']

const TIMEZONES = [
  'America/Toronto',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Vancouver',
  'America/Edmonton',
  'America/Winnipeg',
  'America/Halifax',
  'America/St_Johns',
  'Europe/London',
  'Europe/Paris',
  'Australia/Sydney',
  'Pacific/Auckland',
]

const schema = z.object({
  primary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a hex color'),
  secondary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a hex color'),
  bg_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a hex color'),
  text_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a hex color'),
  heading_font: z.string().min(1),
  body_font: z.string().min(1),
  tagline: z.string().optional(),
  contact_email: z.string().email().optional().or(z.literal('')),
  custom_domain: z.string().optional(),
  social_instagram: z.string().optional(),
  social_facebook: z.string().optional(),
  social_x: z.string().optional(),
  timezone: z.string(),
})

type FormData = z.infer<typeof schema>

// ── Defined outside BrandingForm so React never remounts it on re-render ──────
function ColorField({
  label,
  name,
  control,
  errors,
}: {
  label: string
  name: keyof FormData
  control: Control<FormData>
  errors: FieldErrors<FormData>
}) {
  const { field } = useController({ name, control })
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={field.value as string}
          onChange={(e) => field.onChange(e.target.value)}
          className="h-9 w-12 rounded border cursor-pointer"
        />
        <input
          type="text"
          value={field.value as string}
          onChange={(e) => field.onChange(e.target.value)}
          onBlur={field.onBlur}
          className="flex-1 border rounded-md px-3 py-2 text-sm font-mono"
        />
      </div>
      {errors[name] && <p className="text-red-500 text-xs mt-1">{errors[name]?.message as string}</p>}
    </div>
  )
}

export function BrandingForm({ branding, orgId }: { branding: OrgBranding | null; orgId: string }) {
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [logoUrl, setLogoUrl] = useState<string | null>(branding?.logo_url ?? null)
  const [logoError, setLogoError] = useState<string | null>(null)
  const [logoUploading, startLogoUpload] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const fd = new FormData()
    fd.append('logo', file)
    setLogoError(null)
    startLogoUpload(async () => {
      const result = await uploadOrgLogo(fd)
      if (result.error) {
        setLogoError(result.error)
      } else if (result.url) {
        setLogoUrl(result.url)
      }
    })
  }

  const { register, control, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      primary_color: branding?.primary_color ?? '#FF5C00',
      secondary_color: branding?.secondary_color ?? '#0F1F3D',
      bg_color: branding?.bg_color ?? '#FAFAF8',
      text_color: branding?.text_color ?? '#1A1A1A',
      heading_font: branding?.heading_font ?? 'Barlow Condensed',
      body_font: branding?.body_font ?? 'DM Sans',
      tagline: branding?.tagline ?? '',
      contact_email: branding?.contact_email ?? '',
      custom_domain: branding?.custom_domain ?? '',
      social_instagram: branding?.social_instagram ?? '',
      social_facebook: branding?.social_facebook ?? '',
      social_x: branding?.social_x ?? '',
      timezone: branding?.timezone ?? 'America/Toronto',
    },
  })

  const headingFont = watch('heading_font')
  const bodyFont = watch('body_font')
  const primaryColor = watch('primary_color')
  const secondaryColor = watch('secondary_color')

  async function onSubmit(data: FormData) {
    setLoading(true)
    setSaved(false)
    setSaveError(null)
    const result = await updateBranding({ ...data, orgId })
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
          Branding saved successfully.
        </div>
      )}
      {saveError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
          {saveError}
        </div>
      )}

      <div className="bg-white rounded-lg border p-5 space-y-4">
        <h2 className="font-semibold">Logo</h2>

        {/* Requirements callout */}
        <div className="bg-amber-50 border border-amber-200 rounded-md px-4 py-3 text-sm text-amber-800 space-y-1">
          <p className="font-semibold">Logo requirements for best results</p>
          <ul className="list-disc list-inside space-y-0.5 text-amber-700">
            <li><strong>Format:</strong> PNG with a transparent background</li>
            <li><strong>Shape:</strong> Square (1:1 ratio) — e.g. 512 × 512 px</li>
            <li><strong>Size:</strong> At least 200 × 200 px, max 2 MB</li>
          </ul>
          <p className="text-amber-600 text-xs mt-1">
            The logo is displayed inside a circle on your public site. A transparent-background square PNG will fill the circle cleanly without any visible edges or white borders.
          </p>
        </div>

        <div className="flex items-center gap-6">
          {/* Circle preview — matches how it renders in the nav brand bar */}
          <div className="shrink-0 flex flex-col items-center gap-1.5">
            <div className="w-16 h-16 rounded-full bg-gray-800 ring-2 ring-gray-300 overflow-hidden flex items-center justify-center">
              {logoUploading ? (
                <span className="text-xs text-gray-400">…</span>
              ) : logoUrl ? (
                <Image src={logoUrl} alt="Org logo" width={64} height={64} className="w-full h-full object-contain" unoptimized />
              ) : (
                <span className="text-xs text-gray-500">No logo</span>
              )}
            </div>
            <span className="text-xs text-gray-400">Preview</span>
          </div>

          <div className="space-y-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/svg+xml,image/webp"
              className="hidden"
              onChange={handleLogoChange}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={logoUploading}
              className="px-4 py-2 text-sm font-medium border rounded-md hover:bg-gray-50 disabled:opacity-60"
            >
              {logoUploading ? 'Uploading…' : logoUrl ? 'Replace logo' : 'Upload logo'}
            </button>
            <p className="text-xs text-gray-400">PNG or SVG recommended · max 2 MB</p>
            {logoError && <p className="text-xs text-red-500">{logoError}</p>}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border p-5 space-y-4">
        <h2 className="font-semibold">Colours</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ColorField label="Primary Color" name="primary_color" control={control} errors={errors} />
          <ColorField label="Secondary Color" name="secondary_color" control={control} errors={errors} />
          <ColorField label="Background Color" name="bg_color" control={control} errors={errors} />
          <ColorField label="Text Color" name="text_color" control={control} errors={errors} />
        </div>
      </div>

      <div className="bg-white rounded-lg border p-5 space-y-6">
        <h2 className="font-semibold">Typography</h2>

        <FontPicker
          label="Heading Font"
          value={headingFont}
          onChange={(f) => setValue('heading_font', f, { shouldDirty: true })}
          fonts={HEADING_FONTS}
          linkId="gf-heading"
        />

        <FontPicker
          label="Body Font"
          value={bodyFont}
          onChange={(f) => setValue('body_font', f, { shouldDirty: true })}
          fonts={BODY_FONTS}
          linkId="gf-body"
        />

        {/* Live preview — shows both fonts together with current brand colours */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700">Preview</p>
          <div className="rounded-xl overflow-hidden border shadow-sm">
            {/* Hero strip */}
            <div
              className="px-5 py-4"
              style={{ backgroundColor: secondaryColor, color: '#fff' }}
            >
              <p
                className="text-xs uppercase tracking-widest opacity-60 mb-1"
                style={{ fontFamily: `'${bodyFont}', sans-serif` }}
              >
                Spring Season 2025
              </p>
              <h3
                className="text-3xl font-bold leading-tight"
                style={{ fontFamily: `'${headingFont}', sans-serif` }}
              >
                Championship League
              </h3>
            </div>
            {/* Body strip */}
            <div className="px-5 py-4 bg-white">
              <h4
                className="text-base font-semibold mb-1"
                style={{ fontFamily: `'${headingFont}', sans-serif`, color: primaryColor }}
              >
                About This League
              </h4>
              <p
                className="text-sm text-gray-600 leading-relaxed"
                style={{ fontFamily: `'${bodyFont}', sans-serif` }}
              >
                Register your team and compete in the best recreational sports league in the city.
                Games run weekly with playoff brackets at the end of the season.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border p-5 space-y-4">
        <h2 className="font-semibold">Content & Contact</h2>
        <div className="space-y-3">
          {[
            { label: 'Tagline', name: 'tagline' as keyof FormData },
            { label: 'Contact Email', name: 'contact_email' as keyof FormData },
          ].map(({ label, name }) => (
            <div key={name}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
              <input {...register(name)} type="text" className="w-full border rounded-md px-3 py-2 text-sm" />
            </div>
          ))}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Custom Domain</label>
            <input {...register('custom_domain')} type="text" placeholder="leagues.yourclub.com" className="w-full border rounded-md px-3 py-2 text-sm font-mono" />
            <div className="mt-2 p-3 bg-blue-50 border border-blue-100 rounded-md text-xs text-blue-800 space-y-1">
              <p className="font-semibold">DNS Setup Instructions</p>
              <p>Add a <strong>CNAME</strong> record in your DNS provider pointing to:</p>
              <code className="block mt-1 px-2 py-1 bg-white border border-blue-200 rounded font-mono select-all">app.fielddayapp.ca</code>
              <p className="text-blue-600 mt-1">Changes may take up to 24 hours to propagate. Leave blank to use your free subdomain.</p>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
            <select {...register('timezone')} className="w-full border rounded-md px-3 py-2 text-sm">
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz.replace('_', ' ')}</option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">Used for displaying game times in schedules.</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border p-5 space-y-4">
        <h2 className="font-semibold">Social Links</h2>
        <div className="space-y-3">
          {[
            { label: 'Instagram', name: 'social_instagram' as keyof FormData },
            { label: 'Facebook', name: 'social_facebook' as keyof FormData },
            { label: 'X (Twitter)', name: 'social_x' as keyof FormData },
          ].map(({ label, name }) => (
            <div key={name}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
              <input {...register(name)} type="text" placeholder="URL" className="w-full border rounded-md px-3 py-2 text-sm" />
            </div>
          ))}
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="px-6 py-2.5 rounded-md font-semibold text-white disabled:opacity-60"
        style={{ backgroundColor: 'var(--brand-primary)' }}
      >
        {loading ? 'Saving…' : 'Save Branding'}
      </button>
    </form>
  )
}
