import { defineConfig } from '@pandacss/dev'
import { weappPanda } from 'weapp-pandacss/panda'

export default defineConfig({
  plugins: [weappPanda()],
  polyfill: false, // The adapter compiles layer order for WXSS; Web keeps native layers.
  presets: ['@pandacss/preset-base', '@pandacss/preset-panda'],
  preflight: true,
  include: ['./src/**/*.{ts,vue}'],
  exclude: [],
  outdir: 'styled-system',
  outExtension: 'mjs',
  forceImportExtension: true,
})
