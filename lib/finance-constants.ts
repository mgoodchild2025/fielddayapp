// Shared finance constants. Kept out of actions/finances.ts because that file
// is "use server" and may only export async functions (not runtime values).

export const EXPENSE_CATEGORIES = [
  'rental', 'referee', 'insurance', 'prizes', 'equipment', 'staff', 'marketing', 'other',
] as const

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]

// Org-level overhead (not tied to a single event).
export const OVERHEAD_CATEGORIES = [
  'insurance', 'equipment', 'software', 'rent', 'salaries', 'marketing', 'other',
] as const

export type OverheadCategory = (typeof OVERHEAD_CATEGORIES)[number]

export const OVERHEAD_PERIODS = ['one_time', 'monthly', 'annual'] as const
export type OverheadPeriod = (typeof OVERHEAD_PERIODS)[number]

// Pricing planner: how a projected cost scales.
export const BUDGET_COST_TYPES = ['fixed', 'per_team', 'per_player'] as const
export type BudgetCostType = (typeof BUDGET_COST_TYPES)[number]
