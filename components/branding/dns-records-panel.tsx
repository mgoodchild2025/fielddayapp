'use client'

import { useState, useTransition } from 'react'
import { refreshDnsStatus } from '@/actions/branding'
import type { RailwayDnsRecord } from '@/lib/railway'

interface Props {
  orgId: string
  domain: string
  initialRecords: RailwayDnsRecord[]
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="shrink-0 text-xs px-2 py-0.5 rounded border border-gray-200 hover:bg-gray-50 transition-colors text-gray-500 font-medium"
    >
      {copied ? '✓' : 'Copy'}
    </button>
  )
}

function StatusBadge({ status }: { status: RailwayDnsRecord['status'] }) {
  if (status === 'VALID') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
        Verified
      </span>
    )
  }
  if (status === 'INVALID') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
        Invalid
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
      Pending
    </span>
  )
}

function RecordRow({ record, index }: { record: RailwayDnsRecord; index: number }) {
  const label = record.recordType === 'TXT' ? 'TXT — domain verification' : 'CNAME — routing'
  return (
    <div className="rounded-lg border bg-gray-50 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-gray-700">
          {index + 1}. {label}
        </span>
        <StatusBadge status={record.status} />
      </div>
      <div className="space-y-1.5 text-xs">
        <div className="flex items-center gap-2">
          <span className="w-10 shrink-0 text-gray-400 font-medium">Host</span>
          <code className="flex-1 bg-white border rounded px-2 py-1 font-mono text-gray-800 truncate">
            {record.hostlabel}
          </code>
          <CopyButton value={record.hostlabel} />
        </div>
        <div className="flex items-center gap-2">
          <span className="w-10 shrink-0 text-gray-400 font-medium">Value</span>
          <code className="flex-1 bg-white border rounded px-2 py-1 font-mono text-gray-800 truncate">
            {record.requiredValue}
          </code>
          <CopyButton value={record.requiredValue} />
        </div>
      </div>
    </div>
  )
}

export function DnsRecordsPanel({ orgId, domain, initialRecords }: Props) {
  const [records, setRecords] = useState<RailwayDnsRecord[]>(initialRecords)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const cnameRecord = records.find((r) => r.recordType === 'CNAME')
  const isApex = !domain.startsWith('www.') && domain.split('.').length === 2

  function handleRefresh() {
    setError(null)
    startTransition(async () => {
      const result = await refreshDnsStatus(orgId)
      if (result.error) {
        setError(result.error)
      } else if (result.records) {
        setRecords(result.records)
      }
    })
  }

  const allValid = records.length > 0 && records.every((r) => r.status === 'VALID')

  return (
    <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-blue-900">
            {allValid ? '✓ DNS verified' : 'Add these DNS records at your registrar'}
          </p>
          {!allValid && (
            <p className="text-xs text-blue-700 mt-0.5">
              Create both records, then click Check DNS to confirm.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={isPending}
          className="shrink-0 text-xs px-3 py-1.5 rounded-md border border-blue-300 bg-white text-blue-700 font-medium hover:bg-blue-50 transition-colors disabled:opacity-50"
        >
          {isPending ? 'Checking…' : 'Check DNS'}
        </button>
      </div>

      {records.length === 0 ? (
        <p className="text-xs text-blue-700">
          No DNS records on file — save the branding form to register the domain and generate records.
        </p>
      ) : (
        <div className="space-y-2">
          {records.map((record, i) => (
            <RecordRow key={i} record={record} index={i} />
          ))}
        </div>
      )}

      {isApex && cnameRecord && (
        <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          <strong>Root domain detected.</strong> Most DNS providers don&apos;t allow CNAME on root domains.
          Use an <strong>ALIAS</strong> or <strong>ANAME</strong> record instead of CNAME for record 1
          (Cloudflare supports this automatically), or switch to <code className="bg-white px-1 rounded">www.{domain}</code> as your custom domain.
        </div>
      )}

      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>
      )}
    </div>
  )
}
