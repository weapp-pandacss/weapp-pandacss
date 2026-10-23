import process from 'node:process'
import { fileURLToPath } from 'node:url'
// eslint-disable-next-line e18e/ban-dependencies -- Resolve pnpm.cmd and terminate the owned test server consistently on Windows.
import { execa } from 'execa'
import { docsTargets } from './docs-deployment/identity.mjs'

const cwd = fileURLToPath(new URL('../', import.meta.url))

// Both channels share the output directory and owned preview server; run them sequentially.
for (const channel of ['stable', 'preview']) {
  const env = {
    ...process.env,
    REPO_DOCS_CHANNEL: channel,
    REPO_DOCS_URL: docsTargets[channel].url,
  }
  console.log(`Validating ${channel} documentation at ${env.REPO_DOCS_URL}`)
  await execa('pnpm', ['--filter', '@weapp-pandacss/docs', 'build'], { cwd, env, stdio: 'inherit' })
  await execa('pnpm', ['--filter', '@weapp-pandacss/docs', 'check:deployment'], { cwd, env, stdio: 'inherit' })
  await execa('pnpm', [
    'exec',
    'playwright',
    'test',
    '--config=e2e/docs/playwright.config.ts',
    `--output=test-results/docs-${channel}`,
  ], { cwd, env, stdio: 'inherit' })
}
