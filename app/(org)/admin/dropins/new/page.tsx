import { headers } from 'next/headers'
import { getCurrentOrg, getOrgTimezone } from '@/lib/tenant'
import { DropInSessionForm } from '../session-form'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'New drop-in' }

export default async function NewDropInPage() {
  const org = await getCurrentOrg(await headers())
  const timeZone = await getOrgTimezone(org.id)
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">New Drop-in Session</h1>
      <DropInSessionForm timeZone={timeZone} />
    </div>
  )
}
