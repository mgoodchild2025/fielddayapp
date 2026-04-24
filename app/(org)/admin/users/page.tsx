import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'

export default async function AdminUsersPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()

  const { data: members } = await supabase
    .from('org_members')
    .select(`
      id, role, status, joined_at,
      profile:profiles!org_members_user_id_fkey(full_name, email, phone)
    `)
    .eq('organization_id', org.id)
    .order('joined_at', { ascending: false })

  const roleColors: Record<string, string> = {
    org_admin: 'bg-purple-100 text-purple-700',
    league_admin: 'bg-blue-100 text-blue-700',
    captain: 'bg-orange-100 text-orange-700',
    player: 'bg-gray-100 text-gray-600',
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Members ({members?.length ?? 0})</h1>

      <div className="bg-white rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left">
              <th className="px-4 py-3 font-medium text-gray-500">Name</th>
              <th className="px-4 py-3 font-medium text-gray-500">Email</th>
              <th className="px-4 py-3 font-medium text-gray-500">Role</th>
              <th className="px-4 py-3 font-medium text-gray-500">Status</th>
              <th className="px-4 py-3 font-medium text-gray-500">Joined</th>
            </tr>
          </thead>
          <tbody>
            {members?.map((m) => {
              const profile = Array.isArray(m.profile) ? m.profile[0] : m.profile
              return (
                <tr key={m.id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-medium">{profile?.full_name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{profile?.email ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleColors[m.role] ?? 'bg-gray-100 text-gray-600'}`}>
                      {m.role.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${m.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {m.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{new Date(m.joined_at).toLocaleDateString()}</td>
                </tr>
              )
            })}
            {(!members || members.length === 0) && (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-gray-400">No members yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
