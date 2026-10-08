import { defineConfig } from '@pandacss/dev'
import { weappPanda } from 'weapp-pandacss/panda'

export default defineConfig({
  plugins: [weappPanda()],
  presets: ['@pandacss/preset-base', '@pandacss/preset-panda'],
  preflight: true,
  include: ['./src/**/*.{ts,vue}'],
  exclude: [],
  outdir: 'styled-system',
  outExtension: 'mjs',
  forceImportExtension: true,
})
