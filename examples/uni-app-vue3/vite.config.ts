import path from 'node:path'
import uni from '@dcloudio/vite-plugin-uni'
import panda from '@pandacss/dev/postcss'
import tailwindcss from '@tailwindcss/postcss'
import remToResponsivePixel from 'postcss-rem-to-responsive-pixel'
import { defineConfig } from 'vite'
import weappPanda from 'weapp-pandacss/postcss'
import { WeappTailwindcss } from 'weapp-tailwindcss/vite'
// https://vitejs.dev/config/
export default defineConfig({
  plugins: [uni(), WeappTailwindcss()],
  resolve: {
    alias: [
      {
        find: 'styled-system',
        replacement: path.resolve(__dirname, 'styled-system'),
      },
    ],
  },
  css: {
    postcss: {
      plugins: [
        tailwindcss(),
        panda(),
        weappPanda(),
        remToResponsivePixel({
          // 32 意味着 1rem = 32rpx
          rootValue: 32,
          // 默认所有属性都转化
          propList: ['*'],
          // 转化的单位,可以变成 px / rpx
          transformUnit: 'rpx',
        }),
      ],
    },
  },
})
