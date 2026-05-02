import { redirect } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createServerClient } from '@/lib/supabase/server'

export default async function PlatformAdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('platform_role')
    .eq('id', user.id)
    .single()

  if (profile?.platform_role !== 'platform_admin') redirect('/')

  return (
    <div className="min-h-screen bg-gray-950">
      <nav className="bg-gray-900 border-b border-gray-800 text-white px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Image src="/Fieldday-Icon.png" alt="Fieldday" width={28} height={28} className="rounded" />
          <span className="text-xs text-gray-400 uppercase tracking-widest font-medium">Platform Admin</span>
          <Link href="/super" className="text-sm text-gray-400 hover:text-white transition-colors">Organizations</Link>
          <Link href="/super/settings" className="text-sm text-gray-400 hover:text-white transition-colors">Settings</Link>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-gray-400">{user.email}</span>
          <a href="/login" className="text-gray-400 hover:text-white">Sign out</a>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
    </div>
  )
}
