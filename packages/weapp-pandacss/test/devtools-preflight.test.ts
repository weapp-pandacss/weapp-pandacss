import { execFile } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'

const run = promisify(execFile)
const entry = path.resolve(import.meta.dirname, '../../../e2e/devtools/run.ts')
const base = {
  ...process.env,
  WEAPP_VITE_E2E_DEVTOOLS_CLI_PATH: process.execPath,
  WEAPP_VITE_E2E_APPID: 'wx0123456789abcdef',
  WEAPP_VITE_E2E_DEVTOOLS_STABLE_VERSION: 'test-stable',
  WEAPP_VITE_E2E_DEVTOOLS_INSTALLED_VERSION: 'test-stable',
  WEAPP_VITE_E2E_DEVTOOLS_CHECKED_AT: new Date().toISOString(),
}

it.each([
  [{ WEAPP_VITE_E2E_DEVTOOLS_CLI_PATH: '' }, 'CLI_PATH'],
  [{ WEAPP_VITE_E2E_DEVTOOLS_CLI_PATH: 'relative/cli' }, 'CLI_PATH'],
  [{ WEAPP_VITE_E2E_APPID: 'touristappid' }, 'authorized real AppID'],
  [{ WEAPP_VITE_E2E_APPID: '' }, 'authorized real AppID'],
  [{ WEAPP_VITE_E2E_DEVTOOLS_INSTALLED_VERSION: 'rc' }, 'latest official stable IDE'],
  [{ WEAPP_VITE_E2E_DEVTOOLS_STABLE_VERSION: '' }, 'latest official stable IDE'],
  [{ WEAPP_VITE_E2E_DEVTOOLS_CHECKED_AT: '' }, 'within 24 hours'],
  [{ WEAPP_VITE_E2E_DEVTOOLS_CHECKED_AT: '2000-01-01T00:00:00Z' }, 'within 24 hours'],
  [{ WEAPP_VITE_E2E_DEVTOOLS_CHECKED_AT: '2999-01-01T00:00:00Z' }, 'within 24 hours'],
])('fails real IDE preflight before launching any resources: %j', async (invalid, diagnostic) => {
  await expect(run(process.execPath, ['--experimental-strip-types', entry], { env: { ...base, ...invalid } }))
    .rejects
    .toMatchObject({ code: 1, stderr: expect.stringContaining(diagnostic) })
})
