'use client'

import { useEffect } from 'react'

export const HEADING_FONTS = [
  'Barlow Condensed',
  'Oswald',
  'Bebas Neue',
  'Anton',
  'Black Ops One',
  'Teko',
  'Russo One',
  'Rajdhani',
  'Exo 2',
  'Big Shoulders Display',
  'Fjalla One',
  'Righteous',
  'Bungee',
  'Staatliches',
  'Michroma',
] as const

export const BODY_FONTS = [
  'DM Sans',
  'Inter',
  'Poppins',
  'Nunito',
  'Roboto',
  'Open Sans',
  'Lato',
  'Raleway',
  'Work Sans',
  'Outfit',
  'Plus Jakarta Sans',
  'Mulish',
  'Karla',
  'Source Sans 3',
  'Quicksand',
] as const

interface FontPickerProps {
  label: string
  value: string
  onChange: (font: string) => void
  fonts: readonly string[]
  /** Unique ID for the injected <link> element — prevents duplicate loads */
  linkId: string
}

export function FontPicker({ label, value, onChange, fonts, linkId }: FontPickerProps) {
  // Load all fonts in this picker's list via a single Google Fonts stylesheet
  useEffect(() => {
    if (document.getElementById(linkId)) return
    const families = fonts
      .map((f) => `family=${f.replace(/ /g, '+')}:wght@400;700`)
      .join('&')
    const link = Object.assign(document.createElement('link'), {
      id: linkId,
      rel: 'stylesheet',
      href: `https://fonts.googleapis.com/css2?${families}&display=swap`,
    })
    document.head.appendChild(link)
  }, [fonts, linkId])

  const isCustom = !!value && !fonts.includes(value as never)

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-gray-700">{label}</label>

      {/* Font tiles — "Aa" specimen in each font */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        {fonts.map((font) => {
          const active = value === font
          return (
            <button
              key={font}
              type="button"
              onClick={() => onChange(font)}
              className={`flex flex-col items-center justify-center gap-1 p-2 rounded-lg border transition-all ${
                active
                  ? 'border-2 bg-gray-50 shadow-sm'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
              }`}
              style={{
                borderColor: active ? 'var(--brand-primary)' : undefined,
              }}
            >
              <span
                className="text-xl leading-none font-bold"
                style={{
                  fontFamily: `'${font}', sans-serif`,
                  color: active ? 'var(--brand-primary)' : 'inherit',
                }}
              >
                Aa
              </span>
              <span
                className="text-[10px] leading-tight text-center text-gray-500 line-clamp-2"
                style={{ fontFamily: `'${font}', sans-serif` }}
              >
                {font}
              </span>
            </button>
          )
        })}
      </div>

      {/* Custom font input — escape hatch for fonts not in the curated list */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">
          {isCustom ? (
            <>Custom font: <span className="font-mono font-medium text-gray-700">{value}</span></>
          ) : (
            <>Or enter any <a href="https://fonts.google.com" target="_blank" rel="noopener noreferrer" className="underline">Google Font</a> name</>
          )}
        </label>
        <input
          type="text"
          value={isCustom ? value : ''}
          onChange={(e) => onChange(e.target.value || (fonts[0] as string))}
          placeholder={`e.g. ${fonts[0]}`}
          className="w-full border rounded-md px-3 py-1.5 text-sm font-mono text-gray-600 placeholder-gray-300"
        />
      </div>
    </div>
  )
}
