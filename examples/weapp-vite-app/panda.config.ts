import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { defineConfig } from '@pandacss/dev'

const require = createRequire(import.meta.url)
const adapterCli = path.join(path.dirname(require.resolve('weapp-pandacss/package.json')), 'bin/weapp-pandacss.js')

export default defineConfig({
  presets: ['@pandacss/preset-base', '@pandacss/preset-panda'],
  preflight: true,
  include: ['./src/**/*.{ts,vue}'],
  exclude: [],
  outdir: 'styled-system',
  outExtension: 'mjs',
  forceImportExtension: true,
  plugins: [{
    name: 'weapp-runtime',
    hooks: {
      // Finish patching before the bundler reads regenerated helpers. Panda's
      // synchronous hook cannot wait for an unawaited async adapter call.
      'codegen:done': ({ cwd }) => {
        execFileSync(process.execPath, [adapterCli, 'codegen'], {
          cwd: cwd ?? import.meta.dirname,
          stdio: 'inherit',
        })
      },
    },
  }],
})
