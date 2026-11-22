/**
 * Colour × size options for merchandise (T-shirts in three colours, five sizes).
 *
 * Every purchasable combination is still ONE `merchandise_variants` row with its
 * own stock, so carts, orders, emails, registration add-ons and in-person sales
 * keep working off the variant id + its `label`. The `colour` / `size` columns
 * only tell the shop to show two pickers instead of one list. A variant with
 * neither is a plain option ("Small", "One size") — the old single list.
 *
 * Pure (no I/O) and tested in merch-options.test.ts.
 */

export type OptionVariant = {
  id: string
  label: string
  colour: string | null
  size: string | null
  stock_quantity: number | null
}

/** "Black / M", "Black", "M" — the label stored on the variant row. */
export function variantLabel(colour: string | null, size: string | null): string {
  return [colour?.trim(), size?.trim()].filter(Boolean).join(' / ')
}

/** Same option, ignoring case and spacing ("black " = "Black"). */
export const optionKey = (s: string | null | undefined) => (s ?? '').trim().replace(/\s+/g, ' ').toLowerCase()

const uniqueInOrder = (values: (string | null)[]) => {
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of values) {
    const t = v?.trim()
    if (!t || seen.has(optionKey(t))) continue
    seen.add(optionKey(t))
    out.push(t)
  }
  return out
}

/**
 * The pickers an item needs. `mode: 'list'` = the classic single list (or no
 * options at all); `'grid'` = colour and/or size pickers.
 */
export function optionAxes(variants: Pick<OptionVariant, 'colour' | 'size'>[]) {
  const colours = uniqueInOrder(variants.map((v) => v.colour))
  const sizes = uniqueInOrder(variants.map((v) => v.size))
  return { mode: colours.length || sizes.length ? ('grid' as const) : ('list' as const), colours, sizes }
}

/** The variant for a colour + size pick (either may be absent when the item has only one axis). */
export function findVariant<V extends Pick<OptionVariant, 'colour' | 'size'>>(
  variants: V[], colour: string | null, size: string | null,
): V | null {
  return variants.find((v) => optionKey(v.colour) === optionKey(colour) && optionKey(v.size) === optionKey(size)) ?? null
}

/** Sold out = every combination with that value has stock 0 (blank stock = unlimited). */
export function isValueSoldOut(
  variants: Pick<OptionVariant, 'colour' | 'size' | 'stock_quantity'>[],
  axis: 'colour' | 'size',
  value: string,
  other: string | null = null,
): boolean {
  const otherAxis = axis === 'colour' ? 'size' : 'colour'
  const matching = variants.filter((v) =>
    optionKey(v[axis]) === optionKey(value) &&
    (other === null || optionKey(v[otherAxis]) === optionKey(other)))
  return matching.length > 0 && matching.every((v) => v.stock_quantity === 0)
}

// ── Saving ────────────────────────────────────────────────────────────────────

export type VariantInput = {
  /** Present when editing an existing option. */
  id?: string | null
  label?: string | null
  colour?: string | null
  size?: string | null
  stock_quantity?: number | null
}

export type ExistingVariant = { id: string; label: string; colour: string | null; size: string | null }

export type VariantRow = { label: string; colour: string | null; size: string | null; stock_quantity: number | null; sort_order: number }

/**
 * Turns the editor's list into updates / inserts / deletes, KEEPING the ids of
 * options that still exist. Orders and carts point at a variant id with ON
 * DELETE SET NULL, so the old "delete everything and re-insert" wiped the size
 * off every past order whenever an admin edited the item.
 *
 * An input matches an existing row by id, else by its colour+size (grid) or
 * label (list), so switching an item from the list to colours keeps "M" as M.
 */
export function planVariantSave(existing: ExistingVariant[], input: VariantInput[]) {
  const byId = new Map(existing.map((v) => [v.id, v]))
  const keyOf = (colour: string | null, size: string | null, label: string) =>
    colour || size ? `cs:${optionKey(colour)}|${optionKey(size)}` : `l:${optionKey(label)}`
  const byKey = new Map<string, ExistingVariant>()
  for (const v of existing) {
    byKey.set(keyOf(v.colour, v.size, v.label), v)
    // An old single-list "M" can become the size M of a new grid.
    if (!v.colour && !v.size) byKey.set(`cs:|${optionKey(v.label)}`, byKey.get(`cs:|${optionKey(v.label)}`) ?? v)
  }

  const used = new Set<string>()
  const update: (VariantRow & { id: string })[] = []
  const insert: VariantRow[] = []
  input.forEach((v, i) => {
    const colour = v.colour?.trim() || null
    const size = v.size?.trim() || null
    const label = colour || size ? variantLabel(colour, size) : (v.label ?? '').trim()
    const row: VariantRow = { label, colour, size, stock_quantity: v.stock_quantity ?? null, sort_order: i }
    const free = (x: ExistingVariant | undefined | null | '') => (x && !used.has(x.id) ? x : null)
    // Exact match, else (adding colours to a size-only/plain list) the old size:
    // the first colour's "S" inherits the old "S" row and its orders.
    const match = free(v.id && byId.get(v.id)) ?? free(byKey.get(keyOf(colour, size, label))) ??
      (colour && size ? free(byKey.get(`cs:|${optionKey(size)}`)) : null)
    if (match) {
      used.add(match.id)
      update.push({ ...row, id: match.id })
    } else {
      insert.push(row)
    }
  })
  const remove = existing.filter((v) => !used.has(v.id)).map((v) => v.id)
  return { update, insert, remove }
}

/** Editor check: names filled in, no repeats. Returns the message to show, or null. */
export function validateVariantInput(input: VariantInput[]): string | null {
  const seen = new Set<string>()
  for (const v of input) {
    const grid = !!(v.colour?.trim() || v.size?.trim())
    const label = grid ? variantLabel(v.colour ?? null, v.size ?? null) : (v.label ?? '').trim()
    if (!label) return 'All option names must be filled in'
    const k = optionKey(label)
    if (seen.has(k)) return `“${label}” is listed twice`
    seen.add(k)
    if (v.stock_quantity != null && (!Number.isInteger(v.stock_quantity) || v.stock_quantity < 0)) return 'Stock must be a whole number (or blank for unlimited)'
  }
  return null
}

/** Keeps only colour → photo pairs for colours the item has and photos it owns. */
export function cleanColourImages(
  map: Record<string, string> | null | undefined, colours: string[], photos: string[],
): Record<string, string> | null {
  if (!map) return null
  const out: Record<string, string> = {}
  for (const c of colours) {
    const url = Object.entries(map).find(([k]) => optionKey(k) === optionKey(c))?.[1]
    if (url && photos.includes(url)) out[c] = url
  }
  return Object.keys(out).length ? out : null
}
