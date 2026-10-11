const process = require('node:process')

module.exports = {
  plugins: {
    // Panda's physical entry has already expanded imports and generated CSS.
    './panda-postcss.cjs': {
      imports: false,
      panda: false,
      target: process.env.UNI_PLATFORM === 'h5' ? 'web' : 'weapp',
      units: { rules: [{ from: 'rem', to: process.env.UNI_PLATFORM === 'h5' ? 'px' : 'rpx', factor: 32 }] },
    },
  },
}
