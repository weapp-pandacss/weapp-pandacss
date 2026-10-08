import type { Plugin } from 'vite'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import uni from '@dcloudio/vite-plugin-uni'
import panda from '@pandacss/dev/postcss'
import postcss from 'postcss'
import remToResponsivePixel from 'postcss-rem-to-responsive-pixel'
import { defineConfig } from 'vite'
import { WeappTailwindcss } from 'weapp-tailwindcss/vite'
import pandaAdapter from './panda-postcss.cjs'
// Tailwind's Vite generator removes layer-order-only inputs before framework
// PostCSS runs. Expand Panda's independent entry first so its CSS is retained.
const pandaEntry = path.resolve(__dirname, 'src/panda.css')
const pandaProcessor = postcss([panda({ cwd: __dirname })])
const pandaStyles: Plugin = {
  name: 'example-panda-styles',
  enforce: 'pre',
  resolveId(id) {
    if (id === 'virtual:panda-styles.css') {
      return '\0virtual:panda-styles.css'
    }
  },
  async load(id) {
    if (id !== '\0virtual:panda-styles.css') {
      return
    }
    this.addWatchFile(pandaEntry)
    const code = await fs.readFile(pandaEntry, 'utf8')
    const result = await pandaProcessor.process(code, { from: pandaEntry, map: { inline: false, annotation: false } })
    for (const message of result.messages) {
      if (message.type === 'dependency') {
        this.addWatchFile(message.file)
      }
      else if (message.type === 'dir-dependency') {
        this.addWatchFile(message.dir)
      }
    }
    return { code: result.css, map: result.map?.toJSON() ?? null }
  },
}
// https://vitejs.dev/config/
export default defineConfig({
  plugins: [uni(), pandaStyles, WeappTailwindcss({ cssEntries: [path.resolve(__dirname, 'src/tailwind.css')] })],
  resolve: {
    alias: [
      {
        find: 'styled-system',
        replacement: path.resolve(__dirname, 'styled-system', process.env.UNI_PLATFORM || 'mp-weixin'),
      },
    ],
  },
  css: {
    postcss: {
      plugins: [
        pandaAdapter({ target: process.env.UNI_PLATFORM === 'h5' ? 'web' : 'weapp' }),
        remToResponsivePixel({
          // 32 意味着 1rem = 32rpx
          rootValue: 32,
          // 默认所有属性都转化
          propList: ['*'],
          // 转化的单位,可以变成 px / rpx
          transformUnit: process.env.UNI_PLATFORM === 'h5' ? 'px' : 'rpx',
        }),
      ],
    },
  },
})
