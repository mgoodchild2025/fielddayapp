import { createServerClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'

export default async function PlatformOrgDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const supabase = await createServerClient()
  const { data: org } = await supabase
    .from('organizations')
    .select('*, subscriptions(*), org_branding(*)')
    .eq('id', params.id)
    .single()

  if (!org) notFound()

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">{org.name}</h1>
      <p className="text-gray-500 mb-6">/{org.slug}</p>
      <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto">
        {JSON.stringify(org, null, 2)}
      </pre>
    </div>
  )
}
