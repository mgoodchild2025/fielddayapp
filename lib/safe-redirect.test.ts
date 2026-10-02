import { describe, expect, it } from 'vitest'
import { safeRelativePath } from './safe-redirect'

describe('safeRelativePath', () => {
  it('keeps same-site paths, query included', () => {
    expect(safeRelativePath('/events/summer?tab=schedule')).toBe('/events/summer?tab=schedule')
    expect(safeRelativePath('/')).toBe('/')
  })
  it('rejects other sites and look-alikes', () => {
    for (const bad of ['//evil.com', '/\\evil.com', '/\t/evil.com', '/\n/evil.com', 'https://evil.com', 'evil.com', '', null, undefined]) {
      expect(safeRelativePath(bad)).toBeNull()
    }
  })
})
