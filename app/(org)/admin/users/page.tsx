import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { ChangeMemberRoleForm } from './change-role-form'
import { InviteMemberForm } from './invite-form'
import { MemberActions } from './member-actions'

export default async function AdminUsersPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const db = createServiceRoleClient()

  // Determine current user's role
  const { data: { user } } = await supabase.auth.getUser()
  const { data: currentMember } = await supabase
    .from('org_members')
    .select('role')
    .eq('organization_id', org.id)
    .eq('user_id', user?.id ?? '')
    .single()

  // League admins have no access to the Admins page
  if (currentMember?.role === 'league_admin') redirect('/admin/events')

  const isOrgAdmin = currentMember?.role === 'org_admin'

  // Use service role client so the profiles join isn't blocked by RLS
  const { data: members } = await db
    .from('org_members')
    .select(`
      id, role, status, joined_at, user_id,
      profile:profiles!org_members_user_id_fkey(full_name, email, phone)
    `)
    .eq('organization_id', org.id)
    .in('role', ['org_admin', 'league_admin'])
    .order('joined_at', { ascending: false })

  const roleColors: Record<string, string> = {
    org_admin: 'bg-purple-100 text-purple-700',
    league_admin: 'bg-blue-100 text-blue-700',
  }

  const roleLabel: Record<string, string> = {
    org_admin: 'Org Admin',
    league_admin: 'League Admin',
  }

  const activeCount = members?.filter((m) => m.status === 'active').length ?? 0
  const adminCount = members?.filter((m) => m.role === 'org_admin').length ?? 0

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Admins</h1>
          <p className="text-sm text-gray-500 mt-1">
            {activeCount} active · {adminCount} org admin{adminCount !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Invite panel — org_admin only */}
      {isOrgAdmin && (
        <div className="bg-white rounded-lg border p-4 mb-6">
          <h2 className="text-sm font-semibold mb-3">Add Admin</h2>
          <InviteMemberForm />
        </div>
      )}

      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="border-b bg-gray-50 text-left">
              <th className="px-4 py-3 font-medium text-gray-500">Name</th>
              <th className="px-4 py-3 font-medium text-gray-500">Email</th>
              <th className="px-4 py-3 font-medium text-gray-500">Role</th>
              <th className="px-4 py-3 font-medium text-gray-500">Status</th>
              <th className="px-4 py-3 font-medium text-gray-500">Joined</th>
              {isOrgAdmin && <th className="px-4 py-3 font-medium text-gray-500"></th>}
            </tr>
          </thead>
          <tbody>
            {members?.map((m) => {
              const profile = Array.isArray(m.profile) ? m.profile[0] : m.profile
              const isSelf = m.user_id === user?.id
              return (
                <tr key={m.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">
                    {profile?.full_name ?? '—'}
                    {isSelf && <span className="ml-1 text-xs text-gray-400">(you)</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{profile?.email ?? '—'}</td>
                  <td className="px-4 py-3">
                    {isOrgAdmin && !isSelf ? (
                      <ChangeMemberRoleForm memberId={m.id} currentRole={m.role as 'org_admin' | 'league_admin' | 'captain' | 'player'} />
                    ) : (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleColors[m.role] ?? 'bg-gray-100 text-gray-600'}`}>
                        {roleLabel[m.role] ?? m.role}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        m.status === 'active'
                          ? 'bg-green-100 text-green-700'
                          : m.status === 'suspended'
                          ? 'bg-red-100 text-red-600'
                          : 'bg-yellow-100 text-yellow-700'
                      }`}
                    >
                      {m.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {new Date(m.joined_at).toLocaleDateString()}
                  </td>
                  {isOrgAdmin && (
                    <td className="px-4 py-3">
                      {!isSelf && (
                        <MemberActions
                          memberId={m.id}
                          memberName={profile?.full_name ?? 'this member'}
                          status={m.status}
                        />
                      )}
                    </td>
                  )}
                </tr>
              )
            })}
            {(!members || members.length === 0) && (
              <tr>
                <td colSpan={isOrgAdmin ? 6 : 5} className="px-4 py-12 text-center text-gray-400">
                  No members yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  )
}
