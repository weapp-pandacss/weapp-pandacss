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
  theme: {
    extend: {
      semanticTokens: { colors: { 'brand/主色': { value: '#0f766e' } } },
      recipes: {
        e2eButton: {
          className: '2e2e/button',
          base: { color: '#334155' },
          variants: { tone: { neutral: { bg: '#e2e8f0' }, accent: { bg: '#0284c7' } } },
          compoundVariants: [{ tone: 'accent', css: { color: '#ffffff' } }],
          defaultVariants: { tone: 'neutral' },
        },
      },
      slotRecipes: {
        e2eCard: {
          className: 'e2e/card',
          slots: ['root', 'label'],
          base: { root: { backgroundColor: '#f1f5f9' }, label: { color: '#475569', fontWeight: 'normal' } },
          variants: {
            active: {
              true: { root: { backgroundColor: '#e0f2fe' }, label: { color: '#0284c7' } },
            },
          },
          compoundVariants: [{ active: true, css: { label: { fontWeight: 'bold' } } }],
        },
      },
    },
  },
})
