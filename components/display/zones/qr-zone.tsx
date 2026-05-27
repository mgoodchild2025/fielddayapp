'use client'

import { useEffect, useRef } from 'react'
import QRCode from 'qrcode'
import type { ZoneConfig } from '@/lib/display-types'

interface Props {
  config: Extract<ZoneConfig, { type: 'qr_code' }>
  theme: 'dark' | 'light'
}

export function QrZone({ config, theme }: Props) {
  const isDark = theme === 'dark'
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!canvasRef.current || !config.url) return
    QRCode.toCanvas(canvasRef.current, config.url, {
      width: 320,
      margin: 2,
      color: {
        dark:  isDark ? '#ffffff' : '#000000',
        light: isDark ? '#18181b' : '#ffffff',
      },
    })
  }, [config.url, isDark])

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 px-8">
      <canvas
        ref={canvasRef}
        className="rounded-xl shadow-lg max-w-[min(320px,80%)] w-full h-auto"
      />
      {config.label && (
        <p className={`text-2xl font-bold text-center ${isDark ? 'text-white' : 'text-gray-900'}`}>
          {config.label}
        </p>
      )}
      {config.url && (
        <p className={`text-sm text-center break-all ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>
          {config.url}
        </p>
      )}
    </div>
  )
}
