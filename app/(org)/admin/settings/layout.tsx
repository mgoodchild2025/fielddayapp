import { SettingsNav } from '@/components/layout/settings-nav'

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <SettingsNav />
      {children}
    </div>
  )
}
