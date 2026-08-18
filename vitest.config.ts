import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    include: ['lib/**/*.test.ts', 'actions/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    // Mirror the "@/*" path alias from tsconfig.json
    alias: { '@': path.resolve(__dirname) },
  },
})
