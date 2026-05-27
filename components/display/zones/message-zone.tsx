import type { ZoneConfig } from '@/lib/display-types'

interface Props {
  config: Extract<ZoneConfig, { type: 'message' }>
  theme: 'dark' | 'light'
}

const SIZE_CLASS = {
  sm: 'text-2xl',
  md: 'text-4xl',
  lg: 'text-6xl',
  xl: 'text-8xl',
}

export function MessageZone({ config, theme }: Props) {
  const isDark = theme === 'dark'
  const textSize = SIZE_CLASS[config.font_size ?? 'md']

  return (
    <div className="flex flex-col items-center justify-center h-full px-10 text-center gap-6">
      {config.title && (
        <p className={`text-sm font-bold uppercase tracking-widest ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
          {config.title}
        </p>
      )}
      <p className={`${textSize} font-bold leading-tight ${isDark ? 'text-white' : 'text-gray-900'}`}>
        {config.body}
      </p>
    </div>
  )
}
