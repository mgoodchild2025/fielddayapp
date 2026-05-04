import { MobileBottomNav } from '@/components/layout/mobile-bottom-nav'

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <MobileBottomNav />
    </>
  )
}
