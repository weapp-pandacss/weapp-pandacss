import process from 'node:process'
import { defineConfig } from '@pandacss/dev'
import { weappPanda } from 'weapp-pandacss/panda'

export default defineConfig({
  plugins: [weappPanda()],
  presets: ['@pandacss/preset-base', '@pandacss/preset-panda'],
  // Whether to use css reset
  preflight: true,

  // Where to look for your css declarations
  include: ['./src/**/*.{js,jsx,ts,tsx,vue}'],

  // Files to exclude
  exclude: [],

  // Useful for theme customization
  theme: {
    extend: {},
  },

  // The output directory for your css system
  outdir: `styled-system/${process.env.TARO_ENV || 'weapp'}`,
  importMap: 'styled-system',
  outExtension: 'mjs',
  forceImportExtension: true,
  // Enable Panda's Vue SFC extractor, not only the .vue include glob.
  jsxFramework: 'vue',
})
