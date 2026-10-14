const { resolvePlatform } = require('@weapp-tailwindcss/env')

/**
 * Resolve one framework's build snapshot without inheriting process variables.
 * Platform strings also name generated directories, so preserve them verbatim.
 * @param {'taro' | 'uni'} framework
 * @param {Readonly<{ TARO_ENV?: string | undefined, UNI_PLATFORM?: string | undefined }>} env
 * @returns {{ platform: string, cssTarget: 'weapp' | 'web' }} Original platform and project CSS target.
 */
function resolveBuildEnv(framework, env) {
  let platform
  if (framework === 'taro') {
    platform = env.TARO_ENV || 'weapp'
  }
  else if (framework === 'uni') {
    platform = env.UNI_PLATFORM || 'mp-weixin'
  }
  else {
    throw new Error(`Unsupported build framework: ${framework}`)
  }

  const info = resolvePlatform(platform)
  // Classification is broader than the examples' CSS policy. Retain the exact
  // h5 mapping and legacy fallback without claiming support for other targets.
  const cssTarget = platform === 'h5' && info.isWeb ? 'web' : 'weapp'
  return { platform, cssTarget }
}

module.exports = { resolveBuildEnv }
