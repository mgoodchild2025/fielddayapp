'use client'

import { useEffect, useState } from 'react'

interface Props {
  timezone: string
  theme: 'dark' | 'light'
}

export function ClockZone({ timezone, theme }: Props) {
  const isDark = theme === 'dark'
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const time = new Intl.DateTimeFormat('en-CA', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: timezone,
  }).format(now)

  const date = new Intl.DateTimeFormat('en-CA', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: timezone,
  }).format(now)

  return (
    <div className="flex flex-col items-center justify-center h-full gap-3">
      <p className={`text-7xl font-bold tabular-nums tracking-tight ${isDark ? 'text-white' : 'text-gray-900'}`}>
        {time}
      </p>
      <p className={`text-xl ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
        {date}
      </p>
    </div>
  )
}
