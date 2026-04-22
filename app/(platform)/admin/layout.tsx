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
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-gray-900 text-white px-6 py-4">
        <h1 className="text-lg font-semibold">Fieldday Platform Admin</h1>
      </nav>
      <main className="p-6">{children}</main>
    </div>
  )
}
