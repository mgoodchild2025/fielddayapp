import { MobileBottomNav } from '@/components/layout/mobile-bottom-nav'

export default function PlayerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <MobileBottomNav />
    </>
  )
}
