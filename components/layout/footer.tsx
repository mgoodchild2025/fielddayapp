import type { OrgContext } from '@/lib/tenant'

interface FooterProps {
  org: OrgContext
}

export function Footer({ org }: FooterProps) {
  return (
    <footer
      className="border-t mt-auto py-8 px-6"
      style={{ backgroundColor: 'var(--brand-secondary)', color: 'rgba(255,255,255,0.6)' }}
    >
      <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm">
        <p style={{ fontFamily: 'var(--brand-heading-font)', color: 'white', fontWeight: 'bold' }}>
          {org.name}
        </p>
        <p>© {new Date().getFullYear()} {org.name}. Powered by Fieldday.</p>
      </div>
    </footer>
  )
}
