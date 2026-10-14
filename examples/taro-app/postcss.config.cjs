const process = require('node:process')
const { resolveBuildEnv } = require('../build-env.cjs')

const { cssTarget } = resolveBuildEnv('taro', process.env)

module.exports = {
  plugins: {
    'weapp-pandacss/postcss': {
      target: cssTarget,
      // This project's design uses 1rem = 32rpx; no ratio is implicit.
      units: { rules: [{ from: 'rem', to: cssTarget === 'web' ? 'px' : 'rpx', factor: 32 }] },
    },
  },
}
