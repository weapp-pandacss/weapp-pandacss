const process = require('node:process')

module.exports = {
  plugins: {
    '@pandacss/dev/postcss': {},
    // #\# 这种是 @csstools/postcss-cascade-layers 加的
    './panda-postcss.cjs': { target: process.env.UNI_PLATFORM === 'h5' ? 'web' : 'weapp' },
  },
}
