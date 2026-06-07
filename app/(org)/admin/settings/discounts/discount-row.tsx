'use client'

import { useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import { deleteDiscount, updateDiscount } from '@/actions/discounts'
import { useRouter } from 'next/navigation'

interface DiscountCode {
  id: string
  code: string
  type: string
  value: number
  use_count: number
  max_uses: number | null
  expires_at: string | null
  active: boolean
  applies_to: string
  league_id: string | null
  league_name?: string | null
}

const APPLIES_LABELS: Record<string, string> = {
  all: 'All', leagues: 'Leagues', dropins: 'Drop-ins', shop: 'Shop',
}

export function DiscountRow({ code }: { code: DiscountCode }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  // Fixed-amount value is stored as dollars (e.g. 10 = $10), NOT cents.
  const discountLabel = code.type === 'percent'
    ? `${code.value}% off`
    : `$${Number(code.value).toFixed(2)} off`

  const scopeLabel = code.league_name
    ? code.league_name
    : (APPLIES_LABELS[code.applies_to] ?? code.applies_to)

  return (
    <tr className={`hover:bg-gray-50 ${!code.active ? 'opacity-50' : ''}`}>
      <td className="px-4 py-3 font-mono text-sm font-bold">{code.code}</td>
      <td className="px-4 py-3 text-sm text-gray-700">
        {discountLabel}
        <span className="ml-1.5 text-xs text-gray-400">· {scopeLabel}</span>
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">
        {code.use_count}{code.max_uses ? ` / ${code.max_uses}` : ''}
      </td>
      <td className="px-4 py-3 text-sm text-gray-500">
        {code.expires_at ? new Date(code.expires_at).toLocaleDateString('en-CA') : '—'}
      </td>
      <td className="px-4 py-3">
        <button
          onClick={() => start(async () => {
            await updateDiscount(code.id, { active: !code.active })
            router.refresh()
          })}
          disabled={pending}
          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            code.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
          }`}
        >
          {code.active ? 'Active' : 'Inactive'}
        </button>
      </td>
      <td className="px-4 py-3 text-right">
        <button
          onClick={() => {
            if (!confirm(`Delete code "${code.code}"? This cannot be undone.`)) return
            start(async () => { await deleteDiscount(code.id); router.refresh() })
          }}
          disabled={pending}
          className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 rounded px-2 py-1 transition-colors disabled:opacity-40"
          title="Delete discount code"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Delete
        </button>
      </td>
    </tr>
  )
}
