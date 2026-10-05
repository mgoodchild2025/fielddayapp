import { LogoImage } from './logo-image'
import {
  IconBallVolleyball,
  IconBallFootball,
  IconBallBasketball,
  IconBallBaseball,
  IconBallAmericanFootball,
  IconBallTennis,
  IconRugby,
  IconDiscGolf,
  IconTrophy,
} from '@tabler/icons-react'
import type { Icon as TablerIcon } from '@tabler/icons-react'

// Sport → Tabler icon.  Sports without a specific icon fall back to IconTrophy.
const sportIcons: Record<string, TablerIcon> = {
  volleyball:        IconBallVolleyball,
  beach_volleyball:  IconBallVolleyball,
  soccer:            IconBallFootball,
  basketball:        IconBallBasketball,
  hockey:            IconTrophy,          // no hockey-specific icon in Tabler
  baseball:          IconBallBaseball,
  softball:          IconBallBaseball,
  football:          IconBallAmericanFootball,
  flag_football:     IconBallAmericanFootball,
  rugby:             IconRugby,
  tennis:            IconBallTennis,
  pickleball:        IconBallTennis,      // closest racquet-sport icon
  badminton:         IconBallTennis,      // closest racquet-sport icon
  lacrosse:          IconTrophy,          // no lacrosse icon in Tabler
  ultimate_frisbee:  IconDiscGolf,        // disc sport
  kickball:          IconBallFootball,
  dodgeball:         IconBallFootball,
}

function getSportIcon(sport: string | null | undefined): TablerIcon {
  if (!sport) return IconTrophy
  return sportIcons[sport.toLowerCase()] ?? IconTrophy
}

// Icon stroke-width by size for best visual balance at each scale
const iconSize = { sm: 20, md: 28, lg: 48, xl: 64 } as const
const iconStroke = { sm: 1.75, md: 1.5, lg: 1.25, xl: 1.25 } as const

const sizeClasses = {
  sm:  'w-8 h-8',
  md:  'w-12 h-12',
  lg:  'w-20 h-20',
  xl:  'w-28 h-28',
} as const

const sizePx = { sm: 32, md: 48, lg: 80, xl: 112 } as const

type Size = keyof typeof sizeClasses

interface EventAvatarProps {
  logoUrl?: string | null
  name: string
  sport?: string | null
  size?: Size
  className?: string
  /** Announce the event name (decorative by default — it sits beside the name). */
  labelled?: boolean
}

export function EventAvatar({ logoUrl, name, sport, size = 'sm', className = '', labelled = false }: EventAvatarProps) {
  const sizeClass = sizeClasses[size]
  const px = sizePx[size]

  if (logoUrl) {
    return (
      <LogoImage src={logoUrl} alt={labelled ? name : ''} px={px} style={{ imageOrientation: 'from-image' }} frameClassName={`${sizeClass} rounded-lg overflow-hidden shrink-0 ${className}`} />
    )
  }

  const SportIcon = getSportIcon(sport)

  return (
    <span
      className={`${sizeClass} rounded-lg shrink-0 flex items-center justify-center bg-white/20 ${className}`}
      aria-hidden="true"
    >
      <SportIcon
        size={iconSize[size]}
        stroke={iconStroke[size]}
        className="text-white/80"
      />
    </span>
  )
}
