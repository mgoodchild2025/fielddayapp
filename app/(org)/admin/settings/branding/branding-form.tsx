'use client'

import { useState, useRef, useTransition } from 'react'
import Image from 'next/image'
import { useForm, UseFormRegister, FieldErrors } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { updateBranding, uploadOrgLogo } from '@/actions/branding'
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
  register,
  errors,
}: {
  label: string
  name: keyof FormData
  register: UseFormRegister<FormData>
  errors: FieldErrors<FormData>
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <input {...register(name)} type="color" className="h-9 w-12 rounded border cursor-pointer" />
        <input {...register(name)} type="text" className="flex-1 border rounded-md px-3 py-2 text-sm font-mono" />
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

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
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
        <div className="flex items-center gap-5">
          <div className="h-20 w-40 rounded-lg border bg-gray-50 flex items-center justify-center overflow-hidden shrink-0">
            {logoUploading ? (
              <span className="text-xs text-gray-400">Uploading…</span>
            ) : logoUrl ? (
              <Image src={logoUrl} alt="Org logo" width={160} height={80} className="object-contain h-full w-full p-2" unoptimized />
            ) : (
              <span className="text-xs text-gray-400">No logo</span>
            )}
          </div>
          <div className="space-y-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
              className="hidden"
              onChange={handleLogoChange}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={logoUploading}
              className="px-4 py-2 text-sm font-medium border rounded-md hover:bg-gray-50 disabled:opacity-60"
            >
              {logoUrl ? 'Replace logo' : 'Upload logo'}
            </button>
            <p className="text-xs text-gray-400">PNG, JPG, SVG or WebP · max 2 MB</p>
            {logoError && <p className="text-xs text-red-500">{logoError}</p>}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border p-5 space-y-4">
        <h2 className="font-semibold">Colours</h2>
        <div className="grid grid-cols-2 gap-4">
          <ColorField label="Primary Color" name="primary_color" register={register} errors={errors} />
          <ColorField label="Secondary Color" name="secondary_color" register={register} errors={errors} />
          <ColorField label="Background Color" name="bg_color" register={register} errors={errors} />
          <ColorField label="Text Color" name="text_color" register={register} errors={errors} />
        </div>
      </div>

      <div className="bg-white rounded-lg border p-5 space-y-4">
        <h2 className="font-semibold">Typography</h2>
        <div className="grid grid-cols-2 gap-4">
          {[
            { label: 'Heading Font (Google Fonts name)', name: 'heading_font' as keyof FormData },
            { label: 'Body Font (Google Fonts name)', name: 'body_font' as keyof FormData },
          ].map(({ label, name }) => (
            <div key={name}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
              <input {...register(name)} type="text" className="w-full border rounded-md px-3 py-2 text-sm" />
            </div>
          ))}
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
