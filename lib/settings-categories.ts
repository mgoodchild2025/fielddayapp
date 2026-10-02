import {
  Palette, CreditCard, Bell, ScrollText, Globe, Menu, Plug, Banknote, TicketPercent,
  BookOpen, Shirt, ScanLine, FileSignature, ShieldCheck, Scale,
  type LucideIcon,
} from 'lucide-react'

export interface SettingsCategory {
  href: string
  label: string
  description: string
  Icon: LucideIcon
}

/**
 * Admin → Settings, grouped. The landing page lists every group; sub-pages
 * switch between categories with the SettingsNav select. Add new settings
 * pages here so both stay in step.
 */
export const SETTINGS_GROUPS: { title: string; items: SettingsCategory[] }[] = [
  {
    title: 'Organization',
    items: [
      { href: '/admin/settings/branding',      label: 'Branding',         Icon: Palette,       description: 'Colours, fonts, logo, and custom domain.' },
      { href: '/admin/settings/billing',       label: 'Billing',          Icon: CreditCard,    description: 'Manage your Fieldday subscription and payment method.' },
      { href: '/admin/settings/notifications', label: 'Notifications',    Icon: Bell,          description: 'SMS game reminders and automated player messages.' },
      { href: '/admin/settings/audit',         label: 'Audit Log',        Icon: ScrollText,    description: 'A record of important actions taken in your organization.' },
    ],
  },
  {
    title: 'Website',
    items: [
      { href: '/admin/settings/website',       label: 'Website',          Icon: Globe,         description: 'Site theme, homepage hero, and public site layout.' },
      { href: '/admin/settings/nav',           label: 'Navigation',       Icon: Menu,          description: 'Add custom links to your public navigation bar.' },
      { href: '/admin/settings/integrations',  label: 'Integrations',     Icon: Plug,          description: 'Connect YouTube and social accounts to sync videos and detect live streams.' },
    ],
  },
  {
    title: 'Payments',
    items: [
      { href: '/admin/settings/payments',      label: 'Payments',         Icon: Banknote,      description: 'Connect your Stripe account to accept online payments.' },
      { href: '/admin/settings/discounts',     label: 'Discount Codes',   Icon: TicketPercent, description: 'Create and manage promo / discount codes.' },
    ],
  },
  {
    title: 'Events & game day',
    items: [
      { href: '/admin/settings/event-rules',   label: 'Event Rules',      Icon: BookOpen,      description: 'Reusable rule templates selectable per event.' },
      { href: '/admin/settings/positions',     label: 'Positions',        Icon: Shirt,         description: 'Customise player positions available per sport.' },
      { href: '/admin/settings/checkin',       label: 'Check-In',         Icon: ScanLine,      description: 'Check-in sound and kiosk settings for game day.' },
    ],
  },
  {
    title: 'Compliance',
    items: [
      { href: '/admin/settings/waivers',       label: 'Waivers',          Icon: FileSignature, description: 'Liability waiver shown during player registration.' },
      { href: '/admin/settings/data',          label: 'Data & Privacy',   Icon: ShieldCheck,   description: 'Export player data and manage data retention settings.' },
      { href: '/admin/settings/agreements',    label: 'Legal Agreements', Icon: Scale,         description: 'View the Fieldday agreements your organization has accepted.' },
    ],
  },
]

export const SETTINGS_CATEGORIES: SettingsCategory[] = SETTINGS_GROUPS.flatMap((g) => g.items)
