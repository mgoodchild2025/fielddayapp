'use client'

import { useEffect } from 'react'
import { readSavedDisplay } from './join-form'

export function DoorDisplayResume() {
  useEffect(() => {
    const saved = readSavedDisplay()
    window.location.replace(saved ? `/door/display/${saved.displayToken}` : '/door/join')
  }, [])
  return <main className="min-h-dvh bg-[#0B0B0C]" aria-busy="true" />
}
