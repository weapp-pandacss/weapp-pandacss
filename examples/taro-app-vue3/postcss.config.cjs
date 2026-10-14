const process = require('node:process')
const { resolveBuildEnv } = require('../build-env.cjs')

const { cssTarget } = resolveBuildEnv('taro', process.env)

module.exports = {
  plugins: {
    'weapp-pandacss/postcss': {
      target: cssTarget,
      units: { rules: [{ from: 'rem', to: cssTarget === 'web' ? 'px' : 'rpx', factor: 32 }] },
    },
  },
}
