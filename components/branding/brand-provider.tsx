import type { OrgBranding } from '@/types/database'

interface BrandProviderProps {
  branding: OrgBranding | null
  children: React.ReactNode
}

export function BrandProvider({ branding, children }: BrandProviderProps) {
  const css = `
    :root {
      --brand-primary: ${branding?.primary_color ?? '#FF5C00'};
      --brand-secondary: ${branding?.secondary_color ?? '#0F1F3D'};
      --brand-bg: ${branding?.bg_color ?? '#FAFAF8'};
      --brand-text: ${branding?.text_color ?? '#1A1A1A'};
      --brand-heading-font: '${branding?.heading_font ?? 'Barlow Condensed'}', sans-serif;
      --brand-body-font: '${branding?.body_font ?? 'DM Sans'}', sans-serif;
    }
  `

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      {children}
    </>
  )
}
