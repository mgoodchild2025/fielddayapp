/** The diagonal brand band that tops every door screen (prototype look). */
export function DoorStripes({ className = 'h-3' }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`block w-full ${className}`}
      style={{
        backgroundImage:
          'repeating-linear-gradient(135deg, var(--door-primary) 0 22px, var(--door-secondary) 22px 44px)',
      }}
    />
  )
}

/** Oversized condensed display type used for the one big word on each screen. */
export const DISPLAY_TYPE =
  'font-black uppercase leading-[0.9] tracking-tight [font-stretch:condensed]'
