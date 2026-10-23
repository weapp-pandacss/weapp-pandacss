import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    postcss: 'src/postcss.ts',
    panda: 'src/panda.ts',
    runtime: 'src/runtime.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  deps: {
    onlyBundle: ['@pandacss/types'],
    dts: {
      // Keep Panda's public hook contract without exposing its upstream declaration barrel.
      alwaysBundle: ['@pandacss/types'],
    },
  },
  clean: true,
  shims: true,
  target: 'node22',
  fixedExtension: false,
})
