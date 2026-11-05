import { describe, expect, it } from 'vitest'
import { impersonationGrantsAdmin } from './impersonation'

const admin = { app_metadata: { is_platform_admin: true } }
const player = { app_metadata: {} }

describe('impersonationGrantsAdmin', () => {
  it('grants admin to a platform admin the proxy marked as impersonating', () => {
    expect(impersonationGrantsAdmin('1', admin)).toBe(true)
  })
  it('needs both the proxy header and the platform-admin claim', () => {
    expect(impersonationGrantsAdmin(null, admin)).toBe(false)
    expect(impersonationGrantsAdmin('1', player)).toBe(false)
    expect(impersonationGrantsAdmin('1', { app_metadata: { is_platform_admin: 'true' } })).toBe(false)
    expect(impersonationGrantsAdmin('1', null)).toBe(false)
  })
})
