import path from 'node:path'
import process from 'node:process'
import uni from '@dcloudio/vite-plugin-uni'
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
        pandaAdapter({
          imports: false,
          panda: false,
          target: pandaTarget,
          units: { rules: [{ from: 'rem', to: pandaTarget === 'web' ? 'px' : 'rpx', factor: 32 }] },
        }),
      ],
    },
  },
})
