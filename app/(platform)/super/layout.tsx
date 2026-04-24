import { redirect } from 'next/navigation'
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
          <span className="text-lg font-bold tracking-tight">⚡ Fieldday</span>
          <span className="text-xs text-gray-400 uppercase tracking-widest font-medium">Platform Admin</span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-gray-400">{user.email}</span>
          <form action="/api/auth/logout" method="post">
            <a href="/login" className="text-gray-400 hover:text-white">Sign out</a>
          </form>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
    </div>
  )
}
