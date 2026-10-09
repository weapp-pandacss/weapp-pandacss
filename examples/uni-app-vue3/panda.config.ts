import process from 'node:process'
import { defineConfig } from '@pandacss/dev'
import { weappPanda } from 'weapp-pandacss/panda'

export default defineConfig({
  plugins: [weappPanda()],
  polyfill: false, // The adapter compiles layer order for WXSS; Web keeps native layers.
  presets: ['@pandacss/preset-base', '@pandacss/preset-panda'],
  // Whether to use css reset
  preflight: false,

  // Where to look for your css declarations
  include: ['./src/**/*.{js,jsx,ts,tsx,vue}'],

  // Files to exclude
  exclude: [],

  // Useful for theme customization
  theme: {
    extend: {},
  },

  jsxFramework: 'vue',

  // The output directory for your css system
  outdir: `styled-system/${process.env.UNI_PLATFORM || 'mp-weixin'}`,
  importMap: 'styled-system',
  outExtension: 'mjs',
  forceImportExtension: true,
})
