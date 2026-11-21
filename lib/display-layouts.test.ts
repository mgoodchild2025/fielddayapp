import { describe, expect, it } from 'vitest'
import { LAYOUT_SPECS, LAYOUT_IDS, zoneGridArea, zoneDividers, zoneBox } from './display-layouts'

describe('every layout', () => {
  it.each(LAYOUT_IDS)('%s tiles the screen exactly once', (id) => {
    const spec = LAYOUT_SPECS[id]
    const nc = spec.cols.split(/\s+/).length, nr = spec.rows.split(/\s+/).length
    const seen = new Map<string, number>()
    spec.zones.forEach(({ area: [c1, c2, r1, r2] }, i) => {
      expect(c1).toBeGreaterThanOrEqual(1); expect(c2).toBeLessThanOrEqual(nc + 1)
      expect(r1).toBeGreaterThanOrEqual(1); expect(r2).toBeLessThanOrEqual(nr + 1)
      for (let c = c1; c < c2; c++) for (let r = r1; r < r2; r++) {
        expect(seen.has(`${c},${r}`), `cell ${c},${r} used twice`).toBe(false)
        seen.set(`${c},${r}`, i)
      }
    })
    expect(seen.size).toBe(nc * nr)
    const area = spec.zones.reduce((sum, _, i) => { const b = zoneBox(id, i); return sum + b.width * b.height }, 0)
    expect(area).toBeCloseTo(1)
  })
})

describe('three columns above, one full below', () => {
  it('puts three zones across the top half and one across the bottom', () => {
    expect(LAYOUT_SPECS.three_top_full.zones).toHaveLength(4)
    expect(zoneGridArea('three_top_full', 3)).toEqual({ gridColumn: '1 / 4', gridRow: '2 / 3' })
    expect(zoneBox('three_top_full', 1)).toMatchObject({ top: 0, height: 0.5 })
    expect(zoneBox('three_top_full', 3)).toEqual({ left: 0, top: 0.5, width: 1, height: 0.5 })
  })
  it('draws dividers only between zones', () => {
    expect(zoneDividers('three_top_full', 0)).toEqual({ right: true, bottom: true })
    expect(zoneDividers('three_top_full', 2)).toEqual({ right: false, bottom: true })
    expect(zoneDividers('three_top_full', 3)).toEqual({ right: false, bottom: false })
  })
})

describe('existing layouts keep their dividers', () => {
  it('matches the old rules', () => {
    expect(zoneDividers('two_left_main', 0)).toEqual({ right: true, bottom: true })
    expect(zoneDividers('two_left_main', 1)).toEqual({ right: true, bottom: false })
    expect(zoneDividers('main_top_two', 0)).toEqual({ right: false, bottom: true })
    expect(zoneBox('main_sidebar', 0).width).toBeCloseTo(2 / 3)
  })
})

describe('unknown layouts', () => {
  it('fall back to full screen', () => {
    expect(zoneGridArea('retired_layout', 0)).toEqual({ gridColumn: '1 / 2', gridRow: '1 / 2' })
    expect(zoneGridArea('retired_layout', 1)).toBeNull()
  })
})
