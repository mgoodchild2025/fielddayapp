'use client'

import { useState, useRef, useEffect } from 'react'
import { signWaiverAsGuest } from '@/actions/waivers'
import { RichTextContent } from '@/components/ui/rich-text-content'

interface Waiver {
  id: string
  title: string
  content: string
}

interface Props {
  waiver: Waiver
  leagueId: string
  orgId: string
  prefill?: { name: string; email: string } | null
}

type GuardianRelationship = 'parent' | 'legal_guardian'

function getAge(dob: string): number | null {
  if (!dob) return null
  const birth = new Date(dob)
  if (isNaN(birth.getTime())) return null
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

export function GuestWaiverForm({ waiver, leagueId, orgId, prefill }: Props) {
  const [name, setName] = useState(prefill?.name ?? '')
  const [email, setEmail] = useState(prefill?.email ?? '')
  const [dob, setDob] = useState('')
  const [isMinorToggle, setIsMinorToggle] = useState(false)
  const [guardianName, setGuardianName] = useState('')
  const [guardianRel, setGuardianRel] = useState<GuardianRelationship>('parent')
  const [signatureName, setSignatureName] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [scrolledToBottom, setScrolledToBottom] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [alreadySigned, setAlreadySigned] = useState(false)

  const waiverScrollRef = useRef<HTMLDivElement>(null)

  // Determine minor status
  const ageFromDob = dob ? getAge(dob) : null
  const isMinor = ageFromDob !== null ? ageFromDob < 18 : isMinorToggle

  // Track scroll progress on the waiver content
  useEffect(() => {
    const el = waiverScrollRef.current
    if (!el) return
    function onScroll() {
      if (!el) return
      const atBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 20
      if (atBottom) setScrolledToBottom(true)
    }
    el.addEventListener('scroll', onScroll)
    // Auto-enable if content is short
    onScroll()
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!scrolledToBottom) {
      setError('Please scroll through the entire waiver before signing.')
      return
    }
    if (!agreed) {
      setError('Please check the agreement box.')
      return
    }
    if (isMinor && !guardianName.trim()) {
      setError('Guardian name is required for players under 18.')
      return
    }

    setLoading(true)
    const result = await signWaiverAsGuest({
      waiverId: waiver.id,
      leagueId,
      orgId,
      guestName: name.trim(),
      guestEmail: email.trim(),
      signatureName: isMinor ? guardianName.trim() : signatureName.trim(),
      guardianRelationship: isMinor ? guardianRel : undefined,
    })
    setLoading(false)

    if (result.error) {
      setError(result.error)
      return
    }

    if (result.alreadySigned) {
      setAlreadySigned(true)
    }
    setSuccess(true)
  }

  if (success) {
    return (
      <div className="bg-white rounded-xl border shadow-sm p-8 text-center">
        <div className="text-5xl mb-4">{alreadySigned ? '✓' : '🖊'}</div>
        <h2 className="text-xl font-bold mb-2">
          {alreadySigned ? 'Already signed' : 'Waiver signed!'}
        </h2>
        <p className="text-gray-500 text-sm leading-relaxed">
          {alreadySigned
            ? `We already have a waiver signature on file for ${email}. You're all set.`
            : `Thank you, ${name}. Your waiver has been recorded. No account needed — you're all set.`}
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Personal info */}
      <div className="bg-white rounded-xl border shadow-sm p-6 space-y-4">
        <h2 className="font-semibold text-gray-800">Your Information</h2>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Full Name <span className="text-red-500">*</span></label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoComplete="name"
            className="w-full border rounded-md px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email <span className="text-red-500">*</span></label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="w-full border rounded-md px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Date of Birth <span className="text-gray-400 font-normal">(optional — required if under 18)</span>
          </label>
          <input
            type="date"
            value={dob}
            onChange={(e) => setDob(e.target.value)}
            max={new Date().toISOString().split('T')[0]}
            className="w-full border rounded-md px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Minor toggle — only shown when DOB not provided */}
        {!dob && (
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isMinorToggle}
              onChange={(e) => setIsMinorToggle(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300"
            />
            <span className="text-sm text-gray-600">I am under 18 years old</span>
          </label>
        )}

        {/* Guardian fields */}
        {isMinor && (
          <div className="mt-3 p-4 bg-amber-50 border border-amber-200 rounded-lg space-y-3">
            <p className="text-sm font-medium text-amber-800">
              ⚠ A parent or legal guardian must sign for players under 18.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Guardian Full Name <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={guardianName}
                onChange={(e) => setGuardianName(e.target.value)}
                required={isMinor}
                className="w-full border rounded-md px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Relationship</label>
              <select
                value={guardianRel}
                onChange={(e) => setGuardianRel(e.target.value as GuardianRelationship)}
                className="w-full border rounded-md px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="parent">Parent</option>
                <option value="legal_guardian">Legal Guardian</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Waiver content */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b bg-gray-50">
          <p className="text-sm font-semibold text-gray-700">{waiver.title}</p>
          {!scrolledToBottom && (
            <p className="text-xs text-gray-400 mt-0.5">Scroll to the bottom to enable signing ↓</p>
          )}
        </div>
        <div
          ref={waiverScrollRef}
          className="h-64 overflow-y-auto px-5 py-4"
        >
          <RichTextContent content={waiver.content} className="text-gray-700 text-sm" />
          {/* Sentinel at the very bottom */}
          <div className="h-1" />
        </div>
        {scrolledToBottom && (
          <div className="px-5 py-2 bg-green-50 border-t border-green-100">
            <p className="text-xs text-green-700 font-medium">✓ You've read the full waiver</p>
          </div>
        )}
      </div>

      {/* Signature */}
      <div className="bg-white rounded-xl border shadow-sm p-6 space-y-4">
        <h2 className="font-semibold text-gray-800">Sign</h2>

        {!isMinor && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Type your full name to sign <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={signatureName}
              onChange={(e) => setSignatureName(e.target.value)}
              required={!isMinor}
              placeholder="Your full legal name"
              className="w-full border rounded-md px-3 py-2 text-base italic focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}

        <label className="flex items-start gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-gray-300 shrink-0"
          />
          <span className="text-sm text-gray-600">
            {isMinor
              ? `I, ${guardianName || 'the guardian'}, have read the above waiver and agree on behalf of the player.`
              : 'I have read and agree to the terms of this waiver.'}
          </span>
        </label>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-md px-4 py-3 text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !scrolledToBottom || !agreed || !name || !email || (!isMinor && !signatureName) || (isMinor && !guardianName)}
          className="w-full py-3 rounded-lg font-bold text-white text-sm disabled:opacity-40 transition-opacity"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          {loading ? 'Signing…' : isMinor ? 'Sign as Guardian' : 'Sign Waiver'}
        </button>
      </div>
    </form>
  )
}
