const process = require('node:process')

module.exports = {
  plugins: {
    'weapp-pandacss/postcss': {
      target: process.env.TARO_ENV === 'h5' ? 'web' : 'weapp',
      units: { rules: [{ from: 'rem', to: process.env.TARO_ENV === 'h5' ? 'px' : 'rpx', factor: 32 }] },
    },
  },
}
