const process = require('node:process')

module.exports = {
  plugins: {
    'weapp-pandacss/postcss': {
      target: process.env.TARO_ENV === 'h5' ? 'web' : 'weapp',
      // This project's design uses 1rem = 32rpx; no ratio is implicit.
      units: { rules: [{ from: 'rem', to: process.env.TARO_ENV === 'h5' ? 'px' : 'rpx', factor: 32 }] },
    },
  },
}
