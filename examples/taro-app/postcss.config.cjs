const process = require('node:process')

const plugins = {
  '@pandacss/dev/postcss': {},
}
plugins['weapp-pandacss/postcss'] = {
  target: process.env.TARO_ENV === 'h5' ? 'web' : 'weapp',
}

plugins['postcss-rem-to-responsive-pixel'] = {
  // 32 意味着 1rem = 32rpx
  rootValue: 32,
  // 默认所有属性都转化
  propList: ['*'],
  // 转化的单位,可以变成 px / rpx
  transformUnit: process.env.TARO_ENV === 'h5' ? 'px' : 'rpx',
}

module.exports = {
  plugins,
}
