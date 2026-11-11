import type { OrgBranding } from '@/types/database'
import { readableTextOn, inkOnWhite } from '@/lib/contrast'

interface BrandProviderProps {
  branding: OrgBranding | null
  children: React.ReactNode
}

// These go into a <style> block as text. They are validated on save
// (actions/branding.ts); anything already stored that isn't a hex colour or a
// plain font name falls back to the default here, so a value can never close
// the style tag or add its own rules.
const hex = (v: string | null | undefined, fallback: string) => (v && /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : fallback)
const font = (v: string | null | undefined, fallback: string) => (v && /^[A-Za-z0-9 \-]{1,60}$/.test(v) ? v : fallback)

export function BrandProvider({ branding, children }: BrandProviderProps) {
  const primary = hex(branding?.primary_color, '#FF5C00')
  const css = `
    :root {
      --brand-primary: ${primary};
      --brand-on-primary: ${readableTextOn(primary)};
      --brand-primary-ink: ${inkOnWhite(primary)};
      --brand-secondary: ${hex(branding?.secondary_color, '#0F1F3D')};
      --brand-bg: ${hex(branding?.bg_color, '#FAFAF8')};
      --brand-text: ${hex(branding?.text_color, '#1A1A1A')};
      --brand-heading-font: '${font(branding?.heading_font, 'Barlow Condensed')}', sans-serif;
      --brand-body-font: '${font(branding?.body_font, 'DM Sans')}', sans-serif;
    }
  `

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      {children}
    </>
  )
}
