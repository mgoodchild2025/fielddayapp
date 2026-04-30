import { SettingsNav } from '@/components/layout/settings-nav'

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="pt-2">
      <SettingsNav />
      {children}
    </div>
  )
}
