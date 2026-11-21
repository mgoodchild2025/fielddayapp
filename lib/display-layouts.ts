/**
 * TV display layouts — the ONE definition of each layout's grid. The screen
 * (grid template, where each zone sits, the dividers between zones) and the
 * control panel's picker preview are all derived from it, so a new layout is
 * one entry here. Pure; tested (lib/display-layouts.test.ts).
 */

/** Grid lines, 1-based like CSS: [colStart, colEnd, rowStart, rowEnd]. */
export type ZoneArea = [number, number, number, number]

export interface LayoutSpec {
  label: string
  /** CSS grid-template-columns / -rows, in fr units only. */
  cols: string
  rows: string
  /** One area per zone, in zone order. */
  zones: { area: ZoneArea; label: string }[]
}

const z = (area: ZoneArea, label: string) => ({ area, label })

export const LAYOUT_SPECS = {
  fullscreen:     { label: 'Full',           cols: '1fr',         rows: '1fr',     zones: [z([1, 2, 1, 2], 'A')] },
  split_h:        { label: 'Side by Side',   cols: '1fr 1fr',     rows: '1fr',     zones: [z([1, 2, 1, 2], 'Left'), z([2, 3, 1, 2], 'Right')] },
  split_v:        { label: 'Top / Bottom',   cols: '1fr',         rows: '1fr 1fr', zones: [z([1, 2, 1, 2], 'Top'), z([1, 2, 2, 3], 'Bottom')] },
  main_sidebar:   { label: 'Main + Sidebar', cols: '2fr 1fr',     rows: '1fr',     zones: [z([1, 2, 1, 2], 'Main (large)'), z([2, 3, 1, 2], 'Sidebar')] },
  sidebar_main:   { label: 'Sidebar + Main', cols: '1fr 2fr',     rows: '1fr',     zones: [z([1, 2, 1, 2], 'Sidebar'), z([2, 3, 1, 2], 'Main (large)')] },
  thirds:         { label: 'Three Columns',  cols: '1fr 1fr 1fr', rows: '1fr',     zones: [z([1, 2, 1, 2], 'Left'), z([2, 3, 1, 2], 'Center'), z([3, 4, 1, 2], 'Right')] },
  main_two_right: { label: 'Main + 2 Right', cols: '2fr 1fr',     rows: '1fr 1fr', zones: [z([1, 2, 1, 3], 'Main (large)'), z([2, 3, 1, 2], 'Top Right'), z([2, 3, 2, 3], 'Bottom Right')] },
  two_left_main:  { label: '2 Left + Main',  cols: '1fr 2fr',     rows: '1fr 1fr', zones: [z([1, 2, 1, 2], 'Top Left'), z([1, 2, 2, 3], 'Bottom Left'), z([2, 3, 1, 3], 'Main (large)')] },
  main_top_two:   { label: 'Top + 2 Below',  cols: '1fr 1fr',     rows: '2fr 1fr', zones: [z([1, 3, 1, 2], 'Main (large)'), z([1, 2, 2, 3], 'Bottom Left'), z([2, 3, 2, 3], 'Bottom Right')] },
  two_top_main:   { label: '2 Above + Main', cols: '1fr 1fr',     rows: '1fr 2fr', zones: [z([1, 2, 1, 2], 'Top Left'), z([2, 3, 1, 2], 'Top Right'), z([1, 3, 2, 3], 'Main (large)')] },
  three_rows:     { label: 'Three Rows',     cols: '1fr',         rows: '1fr 1fr 1fr', zones: [z([1, 2, 1, 2], 'Top'), z([1, 2, 2, 3], 'Middle'), z([1, 2, 3, 4], 'Bottom')] },
  four_quad:      { label: '4 Panels',       cols: '1fr 1fr',     rows: '1fr 1fr', zones: [z([1, 2, 1, 2], 'Top Left'), z([2, 3, 1, 2], 'Top Right'), z([1, 2, 2, 3], 'Bottom Left'), z([2, 3, 2, 3], 'Bottom Right')] },

  // ── Three-column layouts ──
  three_top_full: {
    label: '3 Above + Full', cols: '1fr 1fr 1fr', rows: '1fr 1fr',
    zones: [z([1, 2, 1, 2], 'Top Left'), z([2, 3, 1, 2], 'Top Center'), z([3, 4, 1, 2], 'Top Right'), z([1, 4, 2, 3], 'Bottom (full width)')],
  },
  full_three_bottom: {
    label: 'Full + 3 Below', cols: '1fr 1fr 1fr', rows: '1fr 1fr',
    zones: [z([1, 4, 1, 2], 'Top (full width)'), z([1, 2, 2, 3], 'Bottom Left'), z([2, 3, 2, 3], 'Bottom Center'), z([3, 4, 2, 3], 'Bottom Right')],
  },
  wide_center: {
    label: 'Wide Center', cols: '1fr 2fr 1fr', rows: '1fr',
    zones: [z([1, 2, 1, 2], 'Left'), z([2, 3, 1, 2], 'Center (large)'), z([3, 4, 1, 2], 'Right')],
  },
  main_two_cols: {
    label: 'Main + 2 Columns', cols: '2fr 1fr 1fr', rows: '1fr',
    zones: [z([1, 2, 1, 2], 'Main (large)'), z([2, 3, 1, 2], 'Middle'), z([3, 4, 1, 2], 'Right')],
  },
  center_four: {
    label: 'Center + 4 Sides', cols: '1fr 2fr 1fr', rows: '1fr 1fr',
    zones: [z([1, 2, 1, 2], 'Top Left'), z([1, 2, 2, 3], 'Bottom Left'), z([2, 3, 1, 3], 'Center (large)'), z([3, 4, 1, 2], 'Top Right'), z([3, 4, 2, 3], 'Bottom Right')],
  },
  six_grid: {
    label: '6 Panels', cols: '1fr 1fr 1fr', rows: '1fr 1fr',
    zones: [z([1, 2, 1, 2], 'Top Left'), z([2, 3, 1, 2], 'Top Center'), z([3, 4, 1, 2], 'Top Right'), z([1, 2, 2, 3], 'Bottom Left'), z([2, 3, 2, 3], 'Bottom Center'), z([3, 4, 2, 3], 'Bottom Right')],
  },
} satisfies Record<string, LayoutSpec>

export type LayoutId = keyof typeof LAYOUT_SPECS

export const LAYOUT_IDS = Object.keys(LAYOUT_SPECS) as LayoutId[]

/** A stored layout name the app no longer knows renders as Full rather than crashing the TV. */
export const specOf = (layout: string): LayoutSpec => (LAYOUT_SPECS as Record<string, LayoutSpec>)[layout] ?? LAYOUT_SPECS.fullscreen

const frs = (template: string) => template.trim().split(/\s+/).map((t) => parseFloat(t))

/** Grid placement for one zone. */
export function zoneGridArea(layout: LayoutId | string, index: number): { gridColumn: string; gridRow: string } | null {
  const area = specOf(layout).zones[index]?.area
  if (!area) return null
  return { gridColumn: `${area[0]} / ${area[1]}`, gridRow: `${area[2]} / ${area[3]}` }
}

/** Dividers: a zone draws its right / bottom edge unless it touches the screen's edge. */
export function zoneDividers(layout: LayoutId | string, index: number): { right: boolean; bottom: boolean } {
  const spec = specOf(layout)
  const area = spec.zones[index]?.area
  if (!area) return { right: false, bottom: false }
  return { right: area[1] <= frs(spec.cols).length, bottom: area[3] <= frs(spec.rows).length }
}

/** A zone's box as fractions of the screen (0–1), for the picker preview. */
export function zoneBox(layout: LayoutId, index: number): { left: number; top: number; width: number; height: number } {
  const spec = specOf(layout)
  const [c1, c2, r1, r2] = spec.zones[index].area
  const edges = (template: string) => {
    const parts = frs(template)
    const total = parts.reduce((a, b) => a + b, 0)
    const out = [0]
    for (const p of parts) out.push(out[out.length - 1] + p / total)
    return out
  }
  const xs = edges(spec.cols), ys = edges(spec.rows)
  return { left: xs[c1 - 1], top: ys[r1 - 1], width: xs[c2 - 1] - xs[c1 - 1], height: ys[r2 - 1] - ys[r1 - 1] }
}
