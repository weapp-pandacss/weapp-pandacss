import { mpcoreTest } from '@mpcore/vitest/config'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [mpcoreTest()],
  test: {
    include: ['test/**/*.test.ts'],
    globals: true,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
})
