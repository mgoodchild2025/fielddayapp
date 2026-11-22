import { describe, expect, it } from 'vitest'
import {
  variantLabel, optionAxes, findVariant, isValueSoldOut, planVariantSave, validateVariantInput, cleanColourImages,
} from './merch-options'

const v = (id: string, colour: string | null, size: string | null, stock: number | null = null, label?: string) =>
  ({ id, colour, size, stock_quantity: stock, label: label ?? variantLabel(colour, size) })

describe('variantLabel', () => {
  it('joins colour and size', () => {
    expect(variantLabel('Black', 'M')).toBe('Black / M')
    expect(variantLabel(' Black ', null)).toBe('Black')
    expect(variantLabel(null, 'XL')).toBe('XL')
  })
})

describe('optionAxes', () => {
  it('a plain list stays a list', () => {
    expect(optionAxes([v('1', null, null, null, 'Small')]).mode).toBe('list')
    expect(optionAxes([]).mode).toBe('list')
  })
  it('colours and sizes in first-seen order, case-insensitively unique', () => {
    const a = optionAxes([v('1', 'Black', 'S'), v('2', 'Black', 'M'), v('3', 'white', 'S'), v('4', 'White', 'M')])
    expect(a).toEqual({ mode: 'grid', colours: ['Black', 'white'], sizes: ['S', 'M'] })
  })
  it('colour only', () => {
    expect(optionAxes([v('1', 'Red', null), v('2', 'Blue', null)])).toEqual({ mode: 'grid', colours: ['Red', 'Blue'], sizes: [] })
  })
})

describe('findVariant / isValueSoldOut', () => {
  const vs = [v('1', 'Black', 'S', 0), v('2', 'Black', 'M', 3), v('3', 'White', 'S', 0), v('4', 'White', 'M', 0)]
  it('finds the combination', () => {
    expect(findVariant(vs, 'black', 'M')?.id).toBe('2')
    expect(findVariant(vs, 'Red', 'M')).toBeNull()
  })
  it('a colour is sold out only when every size is', () => {
    expect(isValueSoldOut(vs, 'colour', 'White')).toBe(true)
    expect(isValueSoldOut(vs, 'colour', 'Black')).toBe(false)
  })
  it('a size is checked against the picked colour', () => {
    expect(isValueSoldOut(vs, 'size', 'S', 'Black')).toBe(true)
    expect(isValueSoldOut(vs, 'size', 'M', 'Black')).toBe(false)
    expect(isValueSoldOut(vs, 'size', 'M')).toBe(false)
  })
  it('blank stock is unlimited', () => {
    expect(isValueSoldOut([v('1', 'Red', 'S', null)], 'colour', 'Red')).toBe(false)
  })
})

describe('planVariantSave', () => {
  it('keeps ids of options that still exist (orders point at them)', () => {
    const existing = [v('a', 'Black', 'S'), v('b', 'Black', 'M'), v('c', 'White', 'S')]
    const plan = planVariantSave(existing, [
      { colour: 'Black', size: 'S', stock_quantity: 5 },
      { colour: 'Black', size: 'M', stock_quantity: null },
      { colour: 'Navy', size: 'S', stock_quantity: 2 },
    ])
    expect(plan.update.map((u) => u.id)).toEqual(['a', 'b'])
    expect(plan.update[0]).toMatchObject({ label: 'Black / S', stock_quantity: 5, sort_order: 0 })
    expect(plan.insert).toEqual([{ label: 'Navy / S', colour: 'Navy', size: 'S', stock_quantity: 2, sort_order: 2 }])
    expect(plan.remove).toEqual(['c'])
  })
  it('matches by id first (a renamed colour keeps its row)', () => {
    const plan = planVariantSave([v('a', 'Blak', 'S')], [{ id: 'a', colour: 'Black', size: 'S' }])
    expect(plan.update).toEqual([{ id: 'a', label: 'Black / S', colour: 'Black', size: 'S', stock_quantity: null, sort_order: 0 }])
    expect(plan.remove).toEqual([])
  })
  it('an old single-list size becomes that size in the grid', () => {
    const existing = [v('s', null, null, 4, 'S'), v('m', null, null, 2, 'M')]
    const plan = planVariantSave(existing, [{ colour: 'Black', size: 'S' }, { colour: 'White', size: 'S' }])
    expect(plan.update.map((u) => [u.id, u.label])).toEqual([['s', 'Black / S']])
    expect(plan.insert.map((r) => r.label)).toEqual(['White / S'])
    expect(plan.remove).toEqual(['m'])
  })
  it('plain list options match by label', () => {
    const plan = planVariantSave([v('x', null, null, null, 'Small')], [{ label: ' small ' }, { label: 'Large' }])
    expect(plan.update[0]).toMatchObject({ id: 'x', label: 'small' })
    expect(plan.insert[0]).toMatchObject({ label: 'Large', colour: null, size: null })
  })
  it('one existing row is never claimed twice', () => {
    const plan = planVariantSave([v('a', 'Black', 'S')], [{ id: 'a', colour: 'Black', size: 'S' }, { colour: 'Black', size: 'S' }])
    expect(plan.update).toHaveLength(1)
    expect(plan.insert).toHaveLength(1)
  })
})

describe('validateVariantInput', () => {
  it('flags blanks, repeats and bad stock', () => {
    expect(validateVariantInput([{ label: '' }])).toMatch(/filled in/)
    expect(validateVariantInput([{ colour: 'Black', size: 'S' }, { colour: 'black', size: 's' }])).toMatch(/twice/)
    expect(validateVariantInput([{ label: 'S', stock_quantity: -1 }])).toMatch(/whole number/)
    expect(validateVariantInput([{ colour: 'Black', size: 'S', stock_quantity: 3 }, { colour: 'Black', size: 'M' }])).toBeNull()
  })
})

describe('cleanColourImages', () => {
  it('keeps pairs for current colours and owned photos only', () => {
    expect(cleanColourImages({ black: 'p1', Red: 'p2', White: 'evil' }, ['Black', 'White'], ['p1', 'p2'])).toEqual({ Black: 'p1' })
    expect(cleanColourImages({ Red: 'p2' }, ['Black'], ['p2'])).toBeNull()
    expect(cleanColourImages(null, ['Black'], [])).toBeNull()
  })
})
