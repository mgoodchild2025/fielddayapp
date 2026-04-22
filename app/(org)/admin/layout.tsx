import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { AdminSidebar } from '@/components/layout/admin-sidebar'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const headersList = headers()
  const org = await getCurrentOrg(headersList)

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('org_members')
    .select('role')
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .single()

  if (!member || !['org_admin', 'league_admin'].includes(member.role)) {
    redirect('/dashboard')
  }

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: '#F8F8F8' }}>
      <AdminSidebar org={org} role={member.role} />
      <main className="flex-1 overflow-auto">
        <div className="p-6 max-w-6xl mx-auto">{children}</div>
      </main>
    </div>
  )
}
