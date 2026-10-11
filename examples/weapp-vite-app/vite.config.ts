import remToResponsivePixel from 'postcss-rem-to-responsive-pixel'
import weappPanda from 'weapp-pandacss/postcss'
import { defineConfig } from 'weapp-vite/config'

export default defineConfig({
  weapp: {
    srcRoot: 'src',
    platform: 'weapp',
    autoRoutes: true,
    autoImportComponents: true,
    tailwindcss: false,
  },
  css: {
    postcss: {
      plugins: [
        weappPanda(),
        remToResponsivePixel({ rootValue: 32, propList: ['*'], transformUnit: 'rpx' }),
      ],
    },
  },
})
