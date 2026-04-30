'use client'

import { useRouter, usePathname } from 'next/navigation'

const CATEGORIES = [
  { href: '/admin/settings/branding',      label: 'Branding',       description: 'Colours, fonts, logo, and custom domain.' },
  { href: '/admin/settings/notifications', label: 'Notifications',   description: 'SMS game reminders and automated player messages.' },
  { href: '/admin/settings/payments',      label: 'Payments',        description: 'Connect your Stripe account to accept online payments.' },
  { href: '/admin/settings/waivers',       label: 'Waivers',         description: 'Liability waiver shown during player registration.' },
  { href: '/admin/settings/event-rules',   label: 'Event Rules',     description: 'Reusable rule templates selectable per event.' },
  { href: '/admin/settings/positions',     label: 'Positions',       description: 'Customise player positions available per sport.' },
  { href: '/admin/settings/discounts',     label: 'Discount Codes',  description: 'Create and manage promo / discount codes.' },
  { href: '/admin/users',                  label: 'Admins',          description: 'Manage org admins and league admins.' },
]

export function SettingsNav() {
  const router = useRouter()
  const pathname = usePathname()

  const current = CATEGORIES.find(c => pathname.startsWith(c.href)) ?? null

  return (
    <div className="relative mb-6">
      <select
        value={current?.href ?? ''}
        onChange={e => { if (e.target.value) router.push(e.target.value) }}
        className="w-full appearance-none bg-white border rounded-lg px-3 py-2.5 pr-8 text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-0"
      >
        <option value="" disabled>Select a category…</option>
        {CATEGORIES.map(c => (
          <option key={c.href} value={c.href}>{c.label}</option>
        ))}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </div>
  )
}
