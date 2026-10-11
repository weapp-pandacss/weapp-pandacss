import { defineConfig } from '@pandacss/dev'
import { weappPanda } from 'weapp-pandacss/panda'

export default defineConfig({
  plugins: [weappPanda()],
  polyfill: false, // The adapter compiles layer order for WXSS; Web keeps native layers.
  presets: ['@pandacss/preset-base', '@pandacss/preset-panda'],
  // Whether to use css reset
  preflight: true,

  // Where to look for your css declarations
  include: ['./src/**/*.{js,jsx,ts,tsx}', './pages/**/*.{js,jsx,ts,tsx}'],

  // Files to exclude
  exclude: [],

  // Useful for theme customization
  theme: {
    extend: { tokens: { spacing: { 'unit-fixture': { value: '1.25rem' } } } },
  },
  staticCss: { css: [{ properties: { paddingLeft: ['unit-fixture'] } }] },

  // The output directory for your css system
  outdir: 'styled-system',
  outExtension: 'mjs',
  forceImportExtension: true,
})
