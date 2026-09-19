import { describe, it, expect } from 'vitest'
import { isValidDeviceId } from './scoreboard-device'

describe('isValidDeviceId', () => {
  it('accepts the 24-hex-char form the client generates', () => {
    expect(isValidDeviceId('0123456789abcdef01234567')).toBe(true)
  })

  it('rejects anything else — the write path is unauthenticated, so junk stops here', () => {
    expect(isValidDeviceId('0123456789ABCDEF01234567')).toBe(false) // uppercase
    expect(isValidDeviceId('0123456789abcdef0123456')).toBe(false)  // too short
    expect(isValidDeviceId('0123456789abcdef012345678')).toBe(false) // too long
    expect(isValidDeviceId('../../etc/passwd')).toBe(false)
    expect(isValidDeviceId('')).toBe(false)
    expect(isValidDeviceId(null)).toBe(false)
    expect(isValidDeviceId(12345)).toBe(false)
  })
})
