const process = require('node:process')

module.exports = {
  plugins: {
    '@pandacss/dev/postcss': {},
    'weapp-pandacss/postcss': { target: process.env.TARO_ENV === 'h5' ? 'web' : 'weapp' },
    'postcss-rem-to-responsive-pixel': {
      rootValue: 32,
      propList: ['*'],
      transformUnit: process.env.TARO_ENV === 'h5' ? 'px' : 'rpx',
    },
  },
}
