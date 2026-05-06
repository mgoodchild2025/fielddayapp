import Image from 'next/image'

// Sport → emoji fallback
const sportEmoji: Record<string, string> = {
  volleyball: '🏐',
  beach_volleyball: '🏐',
  soccer: '⚽',
  basketball: '🏀',
  hockey: '🏒',
  baseball: '⚾',
  softball: '🥎',
  football: '🏈',
  flag_football: '🏈',
  rugby: '🏉',
  tennis: '🎾',
  pickleball: '🏓',
  badminton: '🏸',
  lacrosse: '🥍',
  ultimate: '🥏',
}

function getSportEmoji(sport: string | null | undefined): string {
  if (!sport) return '🏆'
  return sportEmoji[sport.toLowerCase()] ?? '🏆'
}

const sizeClasses = {
  sm:  'w-8 h-8 text-base',
  md:  'w-12 h-12 text-xl',
  lg:  'w-20 h-20 text-4xl',
  xl:  'w-28 h-28 text-5xl',
} as const

const sizePx = {
  sm:  32,
  md:  48,
  lg:  80,
  xl:  112,
} as const

type Size = keyof typeof sizeClasses

interface EventAvatarProps {
  logoUrl?: string | null
  name: string
  sport?: string | null
  size?: Size
  className?: string
}

export function EventAvatar({ logoUrl, name, sport, size = 'sm', className = '' }: EventAvatarProps) {
  const sizeClass = sizeClasses[size]
  const px = sizePx[size]

  if (logoUrl) {
    return (
      <div className={`${sizeClass} rounded-lg overflow-hidden shrink-0 bg-white ${className}`}>
        <Image
          src={logoUrl}
          alt={name}
          width={px}
          height={px}
          className="w-full h-full object-contain"
          unoptimized
        />
      </div>
    )
  }

  return (
    <div
      className={`${sizeClass} rounded-lg shrink-0 flex items-center justify-center bg-white/20 ${className}`}
    >
      <span role="img" aria-label={sport ?? 'event'}>{getSportEmoji(sport)}</span>
    </div>
  )
}
