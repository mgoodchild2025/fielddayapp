'use client'

import { useEffect } from 'react'
import { playCheckinSound } from '@/lib/audio'

export function CheckinSoundPlayer({ sound }: { sound: string | null | undefined }) {
  useEffect(() => {
    if (sound) playCheckinSound(sound)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
