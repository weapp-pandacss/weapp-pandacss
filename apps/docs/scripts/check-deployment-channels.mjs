import process from 'node:process'
import { fileURLToPath } from 'node:url'
// eslint-disable-next-line e18e/ban-dependencies -- Resolve pnpm.cmd consistently on Windows and propagate child failures.
import { execa } from 'execa'
import { resolveDocumentationDeployment } from '../src/lib/deployment.ts'

const cwd = fileURLToPath(new URL('../', import.meta.url))

// The channels share dist, so each build must be checked before starting the next.
// This entry point always passes --dry-run and never uploads either Worker.
for (const channel of ['stable', 'preview']) {
  const deployment = resolveDocumentationDeployment({ REPO_DOCS_CHANNEL: channel })
  const env = { ...process.env, REPO_DOCS_CHANNEL: channel, REPO_DOCS_URL: deployment.site }
  console.log(`Checking ${channel} documentation deployment at ${deployment.site}`)
  await execa('pnpm', ['run', 'build'], { cwd, env, stdio: 'inherit' })
  await execa('pnpm', ['run', 'check:deployment'], { cwd, env, stdio: 'inherit' })
  await execa('pnpm', ['exec', 'wrangler', 'deploy', '--env', deployment.preview ? 'preview' : '', '--dry-run'], {
    cwd,
    env,
    stdio: 'inherit',
  })
}
