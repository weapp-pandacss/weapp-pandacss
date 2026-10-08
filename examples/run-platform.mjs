import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'

const [framework, target, ...args] = process.argv.slice(2)
if (!['taro', 'uni'].includes(framework) || !target) {
  throw new Error('Usage: node ../run-platform.mjs <taro|uni> <target> <framework args...>')
}
const require = createRequire(path.resolve('package.json'))
const env = { ...process.env, [framework === 'taro' ? 'TARO_ENV' : 'UNI_PLATFORM']: target }
function run(packageName, command, commandArgs) {
  const manifest = require.resolve(`${packageName}/package.json`)
  const bin = require(manifest).bin[command]
  const result = spawnSync(process.execPath, [path.resolve(path.dirname(manifest), bin), ...commandArgs], { env, stdio: 'inherit' })
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}
// The same target is present before Panda loads its config and in the bundler.
run('@pandacss/dev', 'panda', ['codegen'])
run(framework === 'taro' ? '@tarojs/cli' : '@dcloudio/vite-plugin-uni', framework, args)
