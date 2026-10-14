const process = require('node:process')
const { resolveBuildEnv } = require('../build-env.cjs')

const { cssTarget } = resolveBuildEnv('uni', process.env)

module.exports = {
  plugins: {
    // Panda's physical entry has already expanded imports and generated CSS.
    './panda-postcss.cjs': {
      imports: false,
      panda: false,
      target: cssTarget,
      units: { rules: [{ from: 'rem', to: cssTarget === 'web' ? 'px' : 'rpx', factor: 32 }] },
    },
  },
}
