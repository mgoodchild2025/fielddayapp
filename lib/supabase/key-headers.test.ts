import { describe, expect, it } from 'vitest'
import { isJwtKey, supabaseKeyHeaders } from './key-headers'

const legacy = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.c2ln'

describe('supabaseKeyHeaders', () => {
  it('sends a legacy JWT key on both headers', () => {
    expect(isJwtKey(legacy)).toBe(true)
    expect(supabaseKeyHeaders(legacy)).toEqual({ apikey: legacy, Authorization: `Bearer ${legacy}` })
  })
  it('sends new-style keys on apikey only', () => {
    for (const k of ['sb_secret_abc123', 'sb_publishable_xyz789']) {
      expect(isJwtKey(k)).toBe(false)
      expect(supabaseKeyHeaders(k)).toEqual({ apikey: k })
    }
  })
})
