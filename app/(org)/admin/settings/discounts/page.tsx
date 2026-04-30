import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { DiscountForm } from './discount-form'
import { DiscountRow } from './discount-row'

export default async function AdminDiscountsPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = createServiceRoleClient()

  const { data: codes } = await supabase
    .from('discount_codes')
    .select('*')
    .eq('organization_id', org.id)
    .order('created_at', { ascending: false })

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold mb-6">Discount Codes</h1>

      <div className="bg-white rounded-lg border p-5 mb-6">
        <h2 className="font-semibold mb-4">Create New Code</h2>
        <DiscountForm />
      </div>

      {(codes ?? []).length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">No discount codes yet.</p>
      ) : (
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                {['Code', 'Discount', 'Uses', 'Expires', 'Active', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(codes ?? []).map(code => (
                <DiscountRow key={code.id} code={code} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
