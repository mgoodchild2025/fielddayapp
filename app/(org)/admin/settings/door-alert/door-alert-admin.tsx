'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { BellRing, Check, Copy, Printer, Smartphone } from 'lucide-react'
import { Overlay } from '@/components/ui/overlay'
import { confirmAction } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { PrintLink } from '@/components/print/print-link'
import { safeAction } from '@/lib/action-errors'
import { announce } from '@/lib/announce'
import {
  createDoorStation, deleteDoorStation, regenerateDoorVisitorLink, revokeDoorDisplay,
  rotateDoorJoinCredentials, setDoorStationArmed, updateDoorStation,
} from '@/actions/door'
import { appAlertEligibility, sendAppAlertTest, turnOffAppAlerts, turnOnAppAlerts, type AppAlertEligibility } from '@/components/door/app-alerts'
import { readMyDoors, writeMyDoor } from '@/components/door/door-push'

export type AdminStation = {
  id: string
  name: string
  locationLabel: string | null
  isArmed: boolean
  cooldownSeconds: number
  fallbackMessage: string | null
  visitorUrl: string
  joinUrl: string
  joinCode: string
  displays: { id: string; label: string; mode: string; lastSeenAt: string }[]
}

export type AdminRing = {
  id: string
  stationName: string
  locationLabel: string | null
  visitorName: string | null
  createdAt: string
  acknowledgedBy: string | null
  responseSeconds: number | null
}

type Editing = { mode: 'new' } | { mode: 'edit'; station: AdminStation } | null

export function DoorAlertAdmin({ stations, rings, timezone, vapidKey }: { stations: AdminStation[]; rings: AdminRing[]; timezone: string; vapidKey: string | null }) {
  const router = useRouter()
  const [editing, setEditing] = useState<Editing>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const fmt = (iso: string) => new Intl.DateTimeFormat('en-CA', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: timezone,
  }).format(new Date(iso))

  async function run(key: string, action: () => Promise<{ error?: string }>, success: string) {
    setBusy(key)
    const res = await safeAction(action())
    setBusy(null)
    if (res.error) toast.error(res.error)
    else {
      toast.success(success)
      router.refresh()
    }
  }

  async function toggleArmed(s: AdminStation) {
    if (s.isArmed && !(await confirmAction({
      title: `Turn off ${s.name}?`,
      message: 'Visitors will see your fallback message instead of the RING button.',
      confirmLabel: 'Turn off',
      destructive: true,
    }))) return
    await run(`arm:${s.id}`, () => setDoorStationArmed(s.id, !s.isArmed), s.isArmed ? `${s.name} is off` : `${s.name} is on`)
  }

  async function rotate(s: AdminStation) {
    if (!(await confirmAction({
      title: 'Issue a new staff code?',
      message: 'The current staff QR cards and code stop working for new devices. Devices already paired stay paired. Print new staff cards afterwards.',
      confirmLabel: 'New staff code',
    }))) return
    await run(`rotate:${s.id}`, () => rotateDoorJoinCredentials(s.id), 'New staff code issued')
  }

  async function regenerate(s: AdminStation) {
    if (!(await confirmAction({
      title: 'Make a new visitor link?',
      message: 'Every printed door sign for this door stops working. You’ll need to print and post a new sign.',
      confirmLabel: 'Make new link',
      destructive: true,
    }))) return
    await run(`regen:${s.id}`, () => regenerateDoorVisitorLink(s.id), 'New visitor link made — print a new sign')
  }

  async function remove(s: AdminStation) {
    if (!(await confirmAction({
      title: `Delete ${s.name}?`,
      message: 'Its signs and staff cards stop working, every paired device is disconnected, and its ring log is deleted.',
      confirmLabel: 'Delete door',
      destructive: true,
    }))) return
    await run(`delete:${s.id}`, () => deleteDoorStation(s.id), `${s.name} deleted`)
  }

  async function revoke(d: AdminStation['displays'][number]) {
    if (!(await confirmAction({
      title: `Disconnect ${d.label}?`,
      message: 'It stops getting door alerts. Whoever has it can join again with the staff QR or code.',
      confirmLabel: 'Disconnect',
      destructive: true,
    }))) return
    await run(`revoke:${d.id}`, () => revokeDoorDisplay(d.id), `${d.label} disconnected`)
  }

  return (
    <div className="max-w-4xl">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
        <h1 className="text-2xl font-bold">Door Alert</h1>
        <button
          type="button"
          onClick={() => setEditing({ mode: 'new' })}
          className="press min-h-10 rounded-md bg-brand-primary text-on-brand px-4 text-sm font-semibold"
        >
          New door
        </button>
      </div>
      <p className="text-sm text-gray-600 mb-6 max-w-2xl">
        Visitors scan the sign on a locked door and tap RING. Staff phones and screens inside alert until someone taps ON MY WAY.
        Staff pair their own devices with the staff card. No Fieldday account needed.
      </p>

      {stations.length === 0 ? (
        <EmptyState icon={BellRing} title="No doors yet" hint="Create a door, print its sign for the door and a staff card for your team." />
      ) : (
        <div className="space-y-6">
          {stations.map((s) => (
            <section key={s.id} className="bg-white rounded-lg border" aria-labelledby={`door-${s.id}`}>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
                <div className="min-w-0">
                  <h2 id={`door-${s.id}`} className="text-lg font-semibold">{s.name}</h2>
                  <p className="text-sm text-gray-600">
                    {s.locationLabel ? <>Tonight: {s.locationLabel}</> : 'No location set — any paired display can set one'}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={s.isArmed}
                  aria-label={`${s.name} door alert`}
                  disabled={busy === `arm:${s.id}`}
                  onClick={() => void toggleArmed(s)}
                  className="press inline-flex min-h-10 items-center gap-2 rounded-full border px-3 text-sm font-semibold disabled:opacity-60"
                >
                  <span aria-hidden="true" className={`relative inline-block h-5 w-9 rounded-full transition-colors ${s.isArmed ? 'bg-emerald-500' : 'bg-gray-300'}`}>
                    <span className={`absolute left-0 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${s.isArmed ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </span>
                  {s.isArmed ? 'On' : 'Off'}
                </button>
              </div>

              <div className="grid gap-5 px-5 py-4 md:grid-cols-2">
                <div className="space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Door sign (visitors)</h3>
                  <div className="flex flex-wrap gap-2">
                    <PrintLink href={`/admin/settings/door-alert/${s.id}/sign`} className="press inline-flex min-h-10 items-center gap-2 rounded-md border px-3 text-sm font-semibold">
                      <Printer className="h-4 w-4" aria-hidden="true" /> Print sign
                    </PrintLink>
                    <CopyButton text={s.visitorUrl} label="Copy visitor link" />
                  </div>
                  <p className="text-sm text-gray-600">
                    Ring cooldown {s.cooldownSeconds} s. {s.fallbackMessage ? <>When off, visitors see: “{s.fallbackMessage}”</> : 'No fallback message set.'}
                  </p>
                </div>
                <div className="space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Staff card (pair a device)</h3>
                  <div className="flex flex-wrap gap-2">
                    <PrintLink href={`/admin/settings/door-alert/${s.id}/staff-card`} className="press inline-flex min-h-10 items-center gap-2 rounded-md border px-3 text-sm font-semibold">
                      <Printer className="h-4 w-4" aria-hidden="true" /> Print staff card
                    </PrintLink>
                    <CopyButton text={s.joinUrl} label="Copy join link" />
                  </div>
                  <p className="text-sm text-gray-600">Join code <span className="font-mono font-semibold text-gray-900">{s.joinCode}</span> at <span className="font-medium">/door/join</span></p>
                </div>
              </div>

              <MyDevice station={s} vapidKey={vapidKey} onChange={() => router.refresh()} />

              <div className="border-t px-5 py-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Paired devices</h3>
                {s.displays.length === 0 ? (
                  <p className="text-sm text-gray-600">None yet. Staff scan the staff card to pair their phones and screens.</p>
                ) : (
                  <ul className="divide-y">
                    {s.displays.map((d) => (
                      <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                        <div className="min-w-0">
                          <p className="font-medium">{d.label}</p>
                          <p className="text-sm text-gray-600">{d.mode} · last seen {fmt(d.lastSeenAt)}</p>
                        </div>
                        <button type="button" disabled={busy === `revoke:${d.id}`} onClick={() => void revoke(d)} className="press min-h-10 rounded-md px-3 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60">
                          Disconnect
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex flex-wrap gap-2 border-t px-5 py-3 bg-gray-50 rounded-b-lg">
                <button type="button" onClick={() => setEditing({ mode: 'edit', station: s })} className="press min-h-10 rounded-md border bg-white px-3 text-sm font-semibold">Edit</button>
                <button type="button" disabled={busy === `rotate:${s.id}`} onClick={() => void rotate(s)} className="press min-h-10 rounded-md border bg-white px-3 text-sm font-semibold disabled:opacity-60">New staff code</button>
                <button type="button" disabled={busy === `regen:${s.id}`} onClick={() => void regenerate(s)} className="press min-h-10 rounded-md border bg-white px-3 text-sm font-semibold disabled:opacity-60">New visitor link</button>
                <button type="button" disabled={busy === `delete:${s.id}`} onClick={() => void remove(s)} className="press min-h-10 rounded-md px-3 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60 ml-auto">Delete door</button>
              </div>
            </section>
          ))}
        </div>
      )}

      {stations.length > 0 && (
        <section className="mt-8" aria-labelledby="door-ring-log">
          <h2 id="door-ring-log" className="text-lg font-semibold mb-1">Ring log</h2>
          <p className="text-sm text-gray-600 mb-3">The last 30 days. Older rings are deleted automatically.</p>
          {rings.length === 0 ? (
            <p className="text-sm text-gray-600 bg-white border rounded-lg px-4 py-6 text-center">No rings yet.</p>
          ) : (
            <div className="bg-white rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="max-sm:hidden bg-gray-50 border-b text-left text-gray-600">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Time</th>
                    {stations.length > 1 && <th className="px-4 py-2.5 font-medium">Door</th>}
                    <th className="px-4 py-2.5 font-medium">Location</th>
                    <th className="px-4 py-2.5 font-medium">Visitor</th>
                    <th className="px-4 py-2.5 font-medium">Answered by</th>
                    <th className="px-4 py-2.5 font-medium text-right">Response</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rings.map((r) => (
                    <tr key={r.id} className="max-sm:flex max-sm:flex-wrap max-sm:gap-x-4 max-sm:px-4 max-sm:py-3">
                      <td className="px-4 py-2.5 max-sm:p-0 max-sm:w-full font-medium whitespace-nowrap">{fmt(r.createdAt)}</td>
                      {stations.length > 1 && <td data-label="Door: " className="px-4 py-2.5 max-sm:p-0 max-sm:before:content-[attr(data-label)] max-sm:before:text-gray-500">{r.stationName}</td>}
                      <td data-label="Where: " className="px-4 py-2.5 max-sm:p-0 max-sm:before:content-[attr(data-label)] max-sm:before:text-gray-500">{r.locationLabel ?? '—'}</td>
                      <td data-label="Visitor: " className="px-4 py-2.5 max-sm:p-0 max-sm:before:content-[attr(data-label)] max-sm:before:text-gray-500">{r.visitorName ?? '—'}</td>
                      <td data-label="Answered by: " className="px-4 py-2.5 max-sm:p-0 max-sm:before:content-[attr(data-label)] max-sm:before:text-gray-500">
                        {r.acknowledgedBy ?? (r.responseSeconds !== null ? 'A removed device' : <span className="text-red-700 font-medium">Not answered</span>)}
                      </td>
                      <td data-label="Response: " className="px-4 py-2.5 max-sm:p-0 sm:text-right tabular-nums max-sm:before:content-[attr(data-label)] max-sm:before:text-gray-500">
                        {r.responseSeconds !== null ? `${r.responseSeconds} s` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <Overlay
        open={editing !== null}
        onClose={() => setEditing(null)}
        variant="sheet"
        labelledBy="door-station-form-title"
        panelClassName="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-xl shadow-xl max-h-[92dvh] overflow-y-auto"
      >
        {editing && (
          <StationForm
            key={editing.mode === 'edit' ? editing.station.id : 'new'}
            station={editing.mode === 'edit' ? editing.station : null}
            onDone={() => { setEditing(null); router.refresh() }}
            onCancel={() => setEditing(null)}
          />
        )}
      </Overlay>
    </div>
  )
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try { await navigator.clipboard.writeText(text) } catch { toast.error('Couldn’t copy — select the link instead.'); return }
    setCopied(true)
    announce('Link copied')
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button type="button" onClick={() => void copy()} className="press inline-flex min-h-10 items-center gap-2 rounded-md border px-3 text-sm font-semibold">
      {copied
        ? <span key="copied" className="fd-fade-in inline-flex items-center gap-2"><Check className="h-4 w-4 text-green-600" aria-hidden="true" /> Copied!</span>
        : <><Copy className="h-4 w-4" aria-hidden="true" /> {label}</>}
    </button>
  )
}

function StationForm({ station, onDone, onCancel }: { station: AdminStation | null; onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState(station?.name ?? '')
  const [cooldown, setCooldown] = useState(String(station?.cooldownSeconds ?? 45))
  const [fallback, setFallback] = useState(station?.fallbackMessage ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const input = { name, cooldownSeconds: Number(cooldown), fallbackMessage: fallback }
    const res = await safeAction(station ? updateDoorStation(station.id, input) : createDoorStation(input))
    setSaving(false)
    if (res.error) {
      setError(res.error)
      return
    }
    toast.success(station ? 'Door saved' : 'Door created — print its sign and staff card')
    onDone()
  }

  return (
    <form onSubmit={save}>
      <div className="flex items-center justify-between border-b px-5 py-3.5">
        <h2 id="door-station-form-title" className="text-lg font-semibold">{station ? 'Edit door' : 'New door'}</h2>
        <button type="button" onClick={onCancel} className="press min-h-10 px-2 text-sm font-semibold text-gray-600" data-no-dirty>Cancel</button>
      </div>
      <div className="space-y-4 p-5">
        <label className="block">
          <span className="block text-sm font-medium text-gray-700 mb-1">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            required
            data-autofocus
            className="w-full rounded-md border px-3 py-2 text-base"
            placeholder="e.g. Front door, Gym side door"
          />
        </label>
        <label className="block">
          <span className="block text-sm font-medium text-gray-700 mb-1">Ring cooldown (seconds)</span>
          <input
            value={cooldown}
            onChange={(e) => setCooldown(e.target.value.replace(/[^0-9]/g, ''))}
            inputMode="numeric"
            className="w-32 rounded-md border px-3 py-2 text-base"
          />
          <span className="block text-sm text-gray-600 mt-1">How long one phone waits before it can ring again (10–600).</span>
        </label>
        <label className="block">
          <span className="block text-sm font-medium text-gray-700 mb-1">Message when the door alert is off</span>
          <textarea
            value={fallback}
            onChange={(e) => setFallback(e.target.value.slice(0, 200))}
            rows={3}
            className="w-full rounded-md border px-3 py-2 text-base"
            placeholder="e.g. Text Danny at 705-555-0100 and we’ll let you in."
          />
        </label>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={saving} className="press w-full min-h-11 rounded-md bg-brand-primary text-on-brand font-semibold disabled:opacity-60">
          {saving ? 'Saving…' : station ? 'Save' : 'Create door'}
        </button>
      </div>
    </form>
  )
}

/**
 * "Alert me on this phone": the signed-in admin pairs this device in one tap;
 * alerts arrive through the Fieldday app's notifications. Shown after mount
 * (it depends on this browser's storage and notification permission).
 */
function MyDevice({ station, vapidKey, onChange }: { station: AdminStation; vapidKey: string | null; onChange: () => void }) {
  const [ready, setReady] = useState(false)
  const [eligibility, setEligibility] = useState<AppAlertEligibility>('ok')
  const [mine, setMine] = useState<{ displayId: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => {
      const saved = readMyDoors()[station.id]
      // Disconnected by an admin, expired, or the door was recreated: forget it.
      if (saved && !station.displays.some((d) => d.id === saved.displayId)) writeMyDoor(station.id, null)
      setMine(saved && station.displays.some((d) => d.id === saved.displayId) ? saved : null)
      setEligibility(appAlertEligibility())
      setReady(true)
    }, 0)
    return () => clearTimeout(t)
  }, [station.id, station.displays])

  async function turnOn() {
    setBusy(true)
    const res = await turnOnAppAlerts(station.id, vapidKey)
    setBusy(false)
    if (!res.ok) {
      toast.error(res.error)
      setEligibility(appAlertEligibility())
      return
    }
    setMine(readMyDoors()[station.id] ?? null)
    toast.success(`Door alerts on for ${res.label}`)
    onChange()
  }

  async function turnOff() {
    setBusy(true)
    const res = await turnOffAppAlerts(station.id)
    setBusy(false)
    if (!res.ok) {
      toast.error('Couldn’t reach the server. Try again.')
      return
    }
    setMine(null)
    toast.success('Door alerts off for this device')
    onChange()
  }

  async function test() {
    if (await sendAppAlertTest(station.id)) toast('Test alert sent to this device')
    else toast.error('Couldn’t send a test. Check your connection.')
  }

  if (!ready) return null
  return (
    <div className="border-t px-5 py-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">This device</h3>
      {mine ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="mr-auto text-sm text-gray-700">
            <Check className="inline h-4 w-4 text-green-600 -mt-0.5 mr-1" aria-hidden="true" />
            Door alerts come to this device through your Fieldday app.
          </p>
          <button type="button" onClick={() => void test()} className="press min-h-10 rounded-md border px-3 text-sm font-semibold">Send a test</button>
          <button type="button" disabled={busy} onClick={() => void turnOff()} className="press min-h-10 rounded-md border px-3 text-sm font-semibold disabled:opacity-60">Stop alerting me</button>
        </div>
      ) : eligibility === 'ios-browser' ? (
        <p className="text-sm text-gray-700">To get door alerts on this iPhone or iPad, open Fieldday from your Home Screen, come back to this page and tap <strong>Alert me on this device</strong>.</p>
      ) : eligibility === 'unsupported' ? (
        <p className="text-sm text-gray-700">This browser can’t show notifications. Use the staff card on a phone, or open this page in Chrome or Safari.</p>
      ) : eligibility === 'denied' ? (
        <p className="text-sm text-gray-700">Notifications are blocked for Fieldday on this device. Allow them in your browser or phone settings, then reload this page.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void turnOn()}
            className="press inline-flex min-h-10 items-center gap-2 rounded-md bg-brand-primary text-on-brand px-4 text-sm font-semibold disabled:opacity-60"
          >
            <Smartphone className="h-4 w-4" aria-hidden="true" /> {busy ? 'Turning on…' : 'Alert me on this device'}
          </button>
          <p className="text-sm text-gray-600">No code or QR needed. Alerts arrive as Fieldday notifications, on a paired watch too.</p>
        </div>
      )}
    </div>
  )
}
