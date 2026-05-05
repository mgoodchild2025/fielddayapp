import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getCurrentOrg } from '@/lib/tenant'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { PrintControls } from '@/components/print/print-controls'

function isHtml(str: string): boolean {
  return /<[a-z][\s\S]*>/i.test(str?.trim() ?? '')
}

export default async function WaiverSignaturePrintPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const db = createServiceRoleClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: sig } = await (db as any)
    .from('waiver_signatures')
    .select(`
      id, signed_at, signature_name, ip_address, guardian_relationship,
      player:profiles!waiver_signatures_user_id_fkey(full_name, email, phone),
      waiver:waivers!waiver_signatures_waiver_id_fkey(id, title, version, content),
      league:leagues!waiver_signatures_league_id_fkey(id, name)
    `)
    .eq('id', id)
    .eq('organization_id', org.id)
    .single()

  if (!sig) notFound()

  const { data: branding } = await db
    .from('org_branding')
    .select('timezone')
    .eq('organization_id', org.id)
    .single()
  const timezone = branding?.timezone ?? 'America/Toronto'

  const player = Array.isArray(sig.player) ? sig.player[0] : sig.player
  const waiver = Array.isArray(sig.waiver) ? sig.waiver[0] : sig.waiver
  const league = Array.isArray(sig.league) ? sig.league[0] : sig.league
  const isGuardian = !!sig.guardian_relationship
  const guardianLabel = sig.guardian_relationship === 'legal_guardian' ? 'Legal Guardian' : 'Parent'

  const signedDate = new Date(sig.signed_at).toLocaleDateString('en-CA', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: timezone,
  })
  const signedTime = new Date(sig.signed_at).toLocaleTimeString('en-CA', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    timeZone: timezone,
    timeZoneName: 'short',
  })
  const contentIsHtml = isHtml(waiver?.content ?? '')

  return (
    <>
      {/* Print CSS */}
      <style>{`
        @media print {
          @page { size: letter portrait; margin: 0.75in; }
          body { print-color-adjust: exact; -webkit-print-color-adjust: exact; font-size: 11pt; }
        }
      `}</style>

      <div className="min-h-screen bg-white px-8 py-8 max-w-3xl mx-auto">
        {/* Controls — hidden when printing */}
        <PrintControls />

        {/* Document header */}
        <div className="flex items-start justify-between mb-6 pb-4 border-b-2 border-gray-800">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">
              {org.name}
            </p>
            <h1 className="text-2xl font-bold text-gray-900">{waiver?.title ?? 'Waiver'}</h1>
            {waiver?.version && (
              <p className="text-xs text-gray-400 mt-0.5">Version {waiver.version}</p>
            )}
          </div>
          <div className="text-right text-xs text-gray-400 shrink-0 ml-6">
            <p className="font-medium text-gray-600">{league?.name ?? '—'}</p>
            <p className="mt-1">{signedDate}</p>
            <p>{signedTime}</p>
          </div>
        </div>

        {/* Guardian notice */}
        {isGuardian && (
          <div className="mb-6 rounded border border-gray-300 px-4 py-3 bg-gray-50">
            <p className="text-sm font-semibold text-gray-800">⚠ Guardian-Signed Waiver</p>
            <p className="text-xs text-gray-600 mt-1">
              {player?.full_name ?? 'This player'} was under 18 at the time of registration.
              This waiver was signed by their {guardianLabel.toLowerCase()}.
            </p>
          </div>
        )}

        {/* Signatory details */}
        <div className="mb-6 rounded border border-gray-200 px-4 py-3 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-400 font-semibold mb-0.5">Player</p>
            <p className="font-medium text-gray-900">{player?.full_name ?? '—'}</p>
            {player?.email && <p className="text-xs text-gray-500">{player.email}</p>}
            {player?.phone && <p className="text-xs text-gray-500">{player.phone}</p>}
          </div>

          {isGuardian && (
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400 font-semibold mb-0.5">
                Signed By ({guardianLabel})
              </p>
              <p className="font-medium italic text-gray-900" style={{ fontFamily: 'Georgia, serif' }}>
                {sig.signature_name}
              </p>
            </div>
          )}

          {!isGuardian && (
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400 font-semibold mb-0.5">Signature</p>
              <p className="font-medium italic text-lg text-gray-900" style={{ fontFamily: 'Georgia, serif' }}>
                {sig.signature_name}
              </p>
            </div>
          )}

          <div>
            <p className="text-xs uppercase tracking-wide text-gray-400 font-semibold mb-0.5">Date Signed</p>
            <p className="text-gray-900">{signedDate}</p>
            <p className="text-xs text-gray-500">{signedTime}</p>
          </div>

          {sig.ip_address && (
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400 font-semibold mb-0.5">IP Address</p>
              <p className="font-mono text-xs text-gray-600">{sig.ip_address}</p>
            </div>
          )}
        </div>

        {/* Waiver text */}
        <div className="mb-8">
          <p className="text-xs uppercase tracking-wide text-gray-400 font-semibold mb-3">Waiver Text</p>
          <div className="rounded border border-gray-200 p-5 bg-gray-50">
            {contentIsHtml ? (
              <div
                className="prose prose-sm max-w-none text-gray-800"
                dangerouslySetInnerHTML={{ __html: waiver?.content ?? '' }}
              />
            ) : (
              <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                {waiver?.content ?? '—'}
              </p>
            )}
          </div>
        </div>

        {/* Signature block */}
        <div className="border-t-2 border-gray-800 pt-5">
          <p className="text-xs uppercase tracking-wide text-gray-400 font-semibold mb-4">
            Electronic Signature Confirmation
          </p>
          <div className="flex items-end justify-between gap-6">
            <div className="flex-1">
              <p className="text-xs text-gray-400 mb-1">
                {isGuardian
                  ? `${guardianLabel} — agreed & signed on behalf of ${player?.full_name ?? 'the minor player'}`
                  : 'Agreed & signed by'}
              </p>
              <p
                className="text-2xl font-medium italic border-b border-gray-400 pb-1 text-gray-900"
                style={{ fontFamily: 'Georgia, serif' }}
              >
                {sig.signature_name}
              </p>
            </div>
            <div className="shrink-0 text-right text-xs text-gray-500">
              <p className="font-medium">{signedDate}</p>
              <p>{signedTime}</p>
              {sig.ip_address && (
                <p className="font-mono mt-0.5 text-gray-400">{sig.ip_address}</p>
              )}
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-4">
            This document is an electronic record of a waiver signature captured by {org.name} through
            the Fieldday platform. The signature was entered by the signatory at the date, time, and IP
            address shown above.
          </p>
        </div>
      </div>
    </>
  )
}
