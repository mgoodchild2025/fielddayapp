import { TeamAvatar } from '@/components/ui/team-avatar'

/**
 * Event podium — the public event page's showcase of who won.
 * Server-renderable: everything is visible, nothing to click. Gold leads,
 * silver/bronze flank, tier champions follow. Recipients are the roster
 * snapshot frozen at award time.
 */

export interface PodiumMedal {
  id: string
  placement: 'gold' | 'silver' | 'bronze' | 'tier_champion'
  label: string
  teamName: string
  recipients: string[]
  /** Team identity when the team row still exists (medals snapshot the name). */
  logoUrl?: string | null
  color?: string | null
}

const GLYPH: Record<PodiumMedal['placement'], string> = {
  gold: '🥇', silver: '🥈', bronze: '🥉', tier_champion: '🏆',
}
const TONE: Record<PodiumMedal['placement'], string> = {
  gold: 'border-amber-300 bg-amber-50',
  silver: 'border-gray-300 bg-gray-50',
  bronze: 'border-orange-300 bg-orange-50',
  tier_champion: 'border-purple-300 bg-purple-50',
}

function Recipients({ names }: { names: string[] }) {
  if (names.length === 0) return null
  const shown = names.slice(0, 8)
  return (
    <p className="mt-1 text-xs text-gray-500">
      {shown.join(', ')}
      {names.length > shown.length && ` +${names.length - shown.length} more`}
    </p>
  )
}

export function EventPodium({ medals }: { medals: PodiumMedal[] }) {
  if (medals.length === 0) return null
  const gold = medals.find((m) => m.placement === 'gold')
  const silver = medals.find((m) => m.placement === 'silver')
  const bronze = medals.find((m) => m.placement === 'bronze')
  const tiers = medals.filter((m) => m.placement === 'tier_champion')

  return (
    <div className="bg-white rounded-lg border overflow-hidden">
      <div className="px-5 py-3 border-b bg-gray-50">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Final Results</p>
      </div>
      <div className="p-5 space-y-3">
        {gold && (
          <div className={`rounded-lg border-2 px-5 py-4 text-center ${TONE.gold}`}>
            <p className="text-4xl leading-none" aria-hidden>{GLYPH.gold}</p>
            <p className="mt-2 flex items-center justify-center gap-2 text-xl font-bold" style={{ fontFamily: 'var(--brand-heading-font)' }}>
              <TeamAvatar logoUrl={gold.logoUrl ?? null} color={gold.color ?? null} name={gold.teamName} size="sm" />
              <span className="truncate">{gold.teamName}</span>
            </p>
            <p className="text-xs font-semibold uppercase tracking-widest text-amber-700">{gold.label}</p>
            <Recipients names={gold.recipients} />
          </div>
        )}
        {(silver || bronze) && (
          <div className="grid gap-3 sm:grid-cols-2">
            {[silver, bronze].filter((m): m is PodiumMedal => !!m).map((m) => (
              <div key={m.id} className={`rounded-lg border px-4 py-3 text-center ${TONE[m.placement]}`}>
                <p className="text-2xl leading-none" aria-hidden>{GLYPH[m.placement]}</p>
                <p className="mt-1.5 flex items-center justify-center gap-1.5 font-bold">
                  <TeamAvatar logoUrl={m.logoUrl ?? null} color={m.color ?? null} name={m.teamName} size="xs" />
                  <span className="truncate">{m.teamName}</span>
                </p>
                <p className={`text-[11px] font-semibold uppercase tracking-widest ${m.placement === 'silver' ? 'text-gray-500' : 'text-orange-700'}`}>{m.label}</p>
                <Recipients names={m.recipients} />
              </div>
            ))}
          </div>
        )}
        {tiers.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {tiers.map((m) => (
              <div key={m.id} className={`rounded-lg border px-4 py-3 text-center ${TONE.tier_champion}`}>
                <p className="text-2xl leading-none" aria-hidden>{GLYPH.tier_champion}</p>
                <p className="mt-1.5 flex items-center justify-center gap-1.5 font-bold">
                  <TeamAvatar logoUrl={m.logoUrl ?? null} color={m.color ?? null} name={m.teamName} size="xs" />
                  <span className="truncate">{m.teamName}</span>
                </p>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-purple-700">{m.label}</p>
                <Recipients names={m.recipients} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
