import coreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

// Flat config for ESLint 9+ (Next.js 16 removed `next lint`; the `lint`
// script now runs the ESLint CLI directly against this config).
export default [
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      'public/**',
      'supabase/**',
      'next-env.d.ts',
    ],
  },
  ...coreWebVitals,
  ...nextTypescript,
  {
    rules: {
      // The codebase leans on `(db as any)` while types/database.ts lags the
      // schema. Warn (not error) until the typed-client migration lands, so
      // lint can gate CI without blocking on ~100 pre-existing casts.
      '@typescript-eslint/no-explicit-any': 'warn',
      // New React-Compiler-era strictness (react-hooks v7). `purity` false-
      // positives on async server components using new Date()/Date.now();
      // the other two flag pre-existing client patterns. Warn until those
      // components are deliberately reworked.
      'react-hooks/purity': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/static-components': 'warn',
    },
  },
]
