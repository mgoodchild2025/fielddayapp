'use client'

import type { PlayerCareer } from '@/lib/career'
import type { BioCardData } from './player-bio-card'

/**
 * The back of the player card (card flip C2) — a hockey-card back: vitals
 * line, season-by-season table (max three stat columns), career totals over
 * the red line, trophy shelf, and the fact carried over from the front.
 * Same dark ground as the front; the flip wrapper gives both faces one
 * footprint.
 */

export function PlayerCardBack({ bio, career }: { bio: BioCardData; career: PlayerCareer }) {
  const vitals = [
    bio.position,
    bio.hometown,
    career.seasonCount > 0 ? `${career.seasonCount} season${career.seasonCount !== 1 ? 's' : ''}` : null,
  ].filter(Boolean).join(' · ')

  return (
    <div className="flex h-full flex-col text-white">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-lg font-bold uppercase leading-none" style={{ fontFamily: 'var(--brand-heading-font)' }}>
          {bio.name}
        </p>
        {bio.jerseyNumber && <span className="font-mono text-sm text-white/60">№ {bio.jerseyNumber}</span>}
      </div>
      {vitals && <p className="mt-0.5 text-[11px] uppercase tracking-wide text-white/60">{vitals}</p>}

      {career.seasonCount === 0 ? (
        <p className="mt-4 text-sm italic text-white/70">Rookie season — the record starts here. 🏒</p>
      ) : (
        <div className="mt-2 flex-1 space-y-3 overflow-y-auto">
          {career.tables.map((table) => (
            <table key={table.sport} className="w-full border-collapse font-mono text-[11px]" style={{ fontVariantNumeric: 'tabular-nums' }}>
              <thead>
                <tr className="text-left text-[9px] uppercase tracking-wider">
                  <th className="bg-white/15 px-1.5 py-1 font-medium">Season</th>
                  <th className="bg-white/15 px-1.5 py-1 font-medium">Team</th>
                  {table.columns.map((c) => (
                    <th key={c.key} className="bg-white/15 px-1.5 py-1 text-right font-medium" title={c.label}>
                      {c.label.slice(0, 6)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, i) => (
                  <tr key={i} className="border-b border-white/10 text-white/80">
                    <td className="px-1.5 py-1">{row.seasonLabel}</td>
                    <td className="max-w-[9rem] truncate px-1.5 py-1" title={row.leagueName}>
                      {row.teamName}{row.medal ? ` ${row.medal}` : ''}
                    </td>
                    {table.columns.map((c) => (
                      <td key={c.key} className="px-1.5 py-1 text-right">
                        {row.stats[c.key] != null ? row.stats[c.key] : '—'}
                      </td>
                    ))}
                  </tr>
                ))}
                {table.columns.length > 0 && table.rows.length > 1 && (
                  <tr className="border-t-2 border-red-400/70 font-medium text-white">
                    <td className="px-1.5 py-1">CAREER</td>
                    <td className="px-1.5 py-1 text-white/60">{table.rows.length} seasons</td>
                    {table.columns.map((c) => (
                      <td key={c.key} className="px-1.5 py-1 text-right">{table.totals[c.key]}</td>
                    ))}
                  </tr>
                )}
              </tbody>
            </table>
          ))}
        </div>
      )}

      {bio.medalShelf && <p className="mt-2 text-base tracking-widest" title="Career medals">{bio.medalShelf}</p>}
      {bio.tagline && (
        <p className="mt-1.5 border-l-2 pl-2 text-xs italic text-white/70" style={{ borderColor: 'var(--brand-secondary, #d4a017)' }}>
          &ldquo;{bio.tagline}&rdquo;
        </p>
      )}
    </div>
  )
}
