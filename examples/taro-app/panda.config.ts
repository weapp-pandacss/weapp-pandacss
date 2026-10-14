import process from 'node:process'
import { defineConfig } from '@pandacss/dev'
import { weappPanda } from 'weapp-pandacss/panda'
import { resolveBuildEnv } from '../build-env.cjs'

const { platform, cssTarget } = resolveBuildEnv('taro', process.env)

export default defineConfig({
  plugins: [weappPanda()],
  polyfill: false, // The adapter compiles layer order for WXSS; Web keeps native layers.
  presets: ['@pandacss/preset-base', '@pandacss/preset-panda'],
  // Whether to use css reset
  // 小程序没有必要使用
  // https://taro-docs.jd.com/docs/envs#processenvtaro_env
  preflight: cssTarget === 'web',

  // Where to look for your css declarations
  include: ['./src/**/*.{js,jsx,ts,tsx}'],

  // Files to exclude
  exclude: [],

  // Useful for theme customization
  theme: {
    extend: { tokens: { spacing: { 'unit-fixture': { value: '1.25rem' } } } },
  },
  staticCss: { css: [{ properties: { paddingLeft: ['unit-fixture'] } }] },

  // The output directory for your css system
  outdir: `styled-system/${platform}`,
  importMap: 'styled-system',
  outExtension: 'mjs',
  forceImportExtension: true,

  // staticCss: {
  //   css: [
  //     {
  //       properties: {
  //         color: ['red.300']
  //       }
  //     }
  //   ]
  // },
  jsxFramework: 'react',
})
