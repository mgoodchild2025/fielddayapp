// Shared finance constants. Kept out of actions/finances.ts because that file
// is "use server" and may only export async functions (not runtime values).

export const EXPENSE_CATEGORIES = [
  'rental', 'referee', 'insurance', 'prizes', 'equipment', 'staff', 'marketing', 'other',
] as const

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]
