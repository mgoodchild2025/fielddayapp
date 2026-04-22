'use client'

import { useState, useRef } from 'react'
import Papa from 'papaparse'
import { importGamesFromCsv, type CsvGameRow } from '@/actions/schedule'

interface Props {
  leagueId: string
}

export function ScheduleImport({ leagueId }: Props) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ count: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    setError(null)
    setResult(null)

    Papa.parse<CsvGameRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (res) => {
        const rows = res.data as CsvGameRow[]
        const imported = await importGamesFromCsv(leagueId, rows)
        if (imported.error) setError(imported.error)
        else setResult(imported.data!)
        setLoading(false)
      },
      error: (err) => { setError(err.message); setLoading(false) },
    })
  }

  return (
    <div className="bg-white rounded-lg border p-4">
      <h3 className="font-semibold mb-1 text-sm">Import from CSV</h3>
      <p className="text-xs text-gray-400 mb-3">Columns: date, time, home_team, away_team, court, week</p>
      {error && <p className="text-red-500 text-xs mb-2">{error}</p>}
      {result && <p className="text-green-600 text-xs mb-2">{result.count} games imported.</p>}
      <input ref={inputRef} type="file" accept=".csv" onChange={handleFile} className="hidden" />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={loading}
        className="w-full py-2 rounded text-sm font-medium border hover:bg-gray-50 disabled:opacity-60"
      >
        {loading ? 'Importing…' : 'Upload CSV'}
      </button>
    </div>
  )
}
