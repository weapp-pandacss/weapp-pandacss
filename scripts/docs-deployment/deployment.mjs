import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
// eslint-disable-next-line e18e/ban-dependencies -- Use the workspace's cross-platform process runner for Wrangler.
import { execa } from 'execa'
import { activeMatchingVersion, cloudflareClient, readDeploymentVersion } from './cloudflare.mjs'
import { assertBuildIdentity, assertDeploymentContext, buildIdentity, deploymentMessage, docsTargets, resolveChannel } from './identity.mjs'

export async function deployDocumentation({ root, env, channel: requestedChannel, request = fetch, run = execa }) {
  const channel = resolveChannel(requestedChannel)
  assertDeploymentContext(env, channel)
  const website = path.join(root, 'apps/docs')
  const identity = buildIdentity(env)
  assertBuildIdentity(JSON.parse(await readFile(path.join(website, 'dist/docs-build.json'), 'utf8')), identity)
  const target = docsTargets[channel]
  const client = cloudflareClient(env, request)
  let versionId = await activeMatchingVersion(client, target.worker, identity)
  if (!versionId) {
    const temporary = await mkdtemp(path.join(tmpdir(), 'weapp-pandacss-docs-deploy-'))
    const outputFile = path.join(temporary, 'wrangler.jsonl')
    try {
      await run('pnpm', ['exec', 'wrangler', 'deploy', '--env', target.environment, '--message', deploymentMessage(identity)], {
        cwd: website,
        env: { ...env, WRANGLER_OUTPUT_FILE_PATH: outputFile },
        stdio: 'inherit',
      })
      versionId = readDeploymentVersion(await readFile(outputFile, 'utf8'), target.worker, target.environment)
      const active = await activeMatchingVersion(client, target.worker, identity)
      if (active !== versionId) {
        throw new Error('The uploaded documentation version is not confirmed active; retry this same deployment.')
      }
    }
    finally {
      await rm(temporary, { recursive: true, force: true })
    }
  }
  const result = { versionId, url: target.url }
  await writeFile(env.REPO_DOCS_RESULT_FILE, `${JSON.stringify(result)}\n`)
  return result
}
