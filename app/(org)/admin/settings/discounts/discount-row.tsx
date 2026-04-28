'use client'

import { useTransition } from 'react'
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
}

export function DiscountRow({ code }: { code: DiscountCode }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  return (
    <tr className={`hover:bg-gray-50 ${!code.active ? 'opacity-50' : ''}`}>
      <td className="px-4 py-3 font-mono text-sm font-bold">{code.code}</td>
      <td className="px-4 py-3 text-sm text-gray-700">
        {code.type === 'percent' ? `${code.value}% off` : `$${(code.value / 100).toFixed(2)} off`}
        <span className="ml-1 text-xs text-gray-400 capitalize">· {code.applies_to}</span>
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">
        {code.use_count}{code.max_uses ? ` / ${code.max_uses}` : ''}
      </td>
      <td className="px-4 py-3 text-sm text-gray-500">
        {code.expires_at ? new Date(code.expires_at).toLocaleDateString('en-CA') : '—'}
      </td>
      <td className="px-4 py-3">
        <button
          onClick={() => start(async () => { await updateDiscount(code.id, { active: !code.active }); router.refresh() })}
          disabled={pending}
          className={`text-xs px-2 py-0.5 rounded-full font-medium ${code.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}
        >
          {code.active ? 'Active' : 'Inactive'}
        </button>
      </td>
      <td className="px-4 py-3 text-right">
        <button
          onClick={() => {
            if (!confirm(`Delete code "${code.code}"?`)) return
            start(async () => { await deleteDiscount(code.id); router.refresh() })
          }}
          disabled={pending}
          className="text-xs text-red-600 hover:underline disabled:opacity-50"
        >
          Delete
        </button>
      </td>
    </tr>
  )
}
