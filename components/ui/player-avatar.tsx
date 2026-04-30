import Image from 'next/image'

// Deterministic pastel background from a name string
function avatarColor(name: string): string {
  const colors = [
    'bg-blue-200 text-blue-800',
    'bg-green-200 text-green-800',
    'bg-purple-200 text-purple-800',
    'bg-orange-200 text-orange-800',
    'bg-pink-200 text-pink-800',
    'bg-teal-200 text-teal-800',
    'bg-indigo-200 text-indigo-800',
    'bg-amber-200 text-amber-800',
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

const sizeClasses = {
  xs: 'w-6 h-6 text-xs',
  sm: 'w-8 h-8 text-sm',
  md: 'w-12 h-12 text-base',
  lg: 'w-20 h-20 text-2xl',
} as const

type Size = keyof typeof sizeClasses

interface PlayerAvatarProps {
  avatarUrl: string | null | undefined
  name: string
  size?: Size
  className?: string
}

export function PlayerAvatar({ avatarUrl, name, size = 'sm', className = '' }: PlayerAvatarProps) {
  const sizeClass = sizeClasses[size]
  const initial = (name || '?')[0].toUpperCase()

  if (avatarUrl) {
    return (
      <div className={`${sizeClass} rounded-full overflow-hidden shrink-0 ${className}`}>
        <Image
          src={avatarUrl}
          alt={name}
          width={size === 'lg' ? 80 : size === 'md' ? 48 : size === 'xs' ? 24 : 32}
          height={size === 'lg' ? 80 : size === 'md' ? 48 : size === 'xs' ? 24 : 32}
          className="w-full h-full object-cover"
          unoptimized // avatars are already small; skip Next.js image optimization
        />
      </div>
    )
  }

  return (
    <div
      className={`${sizeClass} rounded-full flex items-center justify-center shrink-0 font-semibold ${avatarColor(name)} ${className}`}
    >
      {initial}
    </div>
  )
}
