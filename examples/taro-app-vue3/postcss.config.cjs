const process = require('node:process')

module.exports = {
  plugins: {
    'weapp-pandacss/postcss': process.env.TARO_ENV === 'h5' ? { target: 'web' } : {},
    'postcss-rem-to-responsive-pixel': {
      rootValue: 32,
      propList: ['*'],
      transformUnit: process.env.TARO_ENV === 'h5' ? 'px' : 'rpx',
    },
  },
}
