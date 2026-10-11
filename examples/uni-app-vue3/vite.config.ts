import path from 'node:path'
import process from 'node:process'
import uni from '@dcloudio/vite-plugin-uni'
import remToResponsivePixel from 'postcss-rem-to-responsive-pixel'
import { defineConfig } from 'vite'
import { WeappTailwindcss } from 'weapp-tailwindcss/vite'
import pandaAdapter from './panda-postcss.cjs'
import { createPandaStyles } from './panda-styles'
// Expand imports against the physical Panda entry before creating a virtual CSS module.
const pandaTarget = process.env.UNI_PLATFORM === 'h5' ? 'web' : 'weapp'
const pandaStyles = createPandaStyles({
  cwd: __dirname,
  entry: path.resolve(__dirname, 'src/panda.css'),
  target: pandaTarget,
})
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
        pandaAdapter({ target: pandaTarget }),
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
