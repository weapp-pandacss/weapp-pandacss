import assert from 'node:assert/strict'
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
// eslint-disable-next-line test/no-import-node-test -- Deployment adapter tests run through the standalone docs:test Node command.
import { test } from 'node:test'
import { activeMatchingVersion, cloudflareClient, readDeploymentVersion } from './cloudflare.mjs'
import { deployDocumentation } from './deployment.mjs'
import { assertDeploymentContext, buildIdentity, deploymentMessage, docsTargets } from './identity.mjs'

const versionId = '11111111-2222-3333-4444-555555555555'
const otherVersionId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

async function fixture(t, channel = 'preview') {
  const root = await mkdtemp(path.join(tmpdir(), 'weapp-pandacss-docs-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const env = {
    REPO_DOCS_SITE: 'website',
    REPO_DOCS_CHANNEL: channel,
    REPO_DOCS_SOURCE_SHA: 'a'.repeat(40),
    REPO_DOCS_DEPLOYMENT_ID: 'b'.repeat(64),
    REPO_DOCS_RELEASE_ID: channel === 'stable' ? 'c'.repeat(64) : '',
    REPO_DOCS_URL: docsTargets[channel].url,
    REPO_DOCS_RESULT_FILE: path.join(root, 'deployment-result.json'),
    GITHUB_ACTIONS: 'true',
    GITHUB_RUN_ID: '1234',
    REPO_DOCS_CONCURRENCY_GROUP: `docs-website-${channel}`,
    CLOUDFLARE_ACCOUNT_ID: 'd'.repeat(32),
    CLOUDFLARE_API_TOKEN: 'test-token',
  }
  const identity = buildIdentity(env)
  const artifact = path.join(root, 'apps/docs/dist/docs-build.json')
  await mkdir(path.dirname(artifact), { recursive: true })
  await writeFile(artifact, JSON.stringify(identity))
  const state = { active: undefined, message: deploymentMessage(identity), percentage: 100, requests: [], runs: [] }
  const request = async (url, options) => {
    state.requests.push(url)
    assert.equal(options.headers.Authorization, 'Bearer test-token')
    assert.ok(url.includes(`/workers/scripts/${docsTargets[channel].worker}/`))
    if (url.endsWith('/deployments')) {
      if (!state.active) {
        return Response.json({ success: false, errors: [{ code: 10007 }] }, { status: 404 })
      }
      return Response.json({ success: true, result: { deployments: [{
        created_on: '2026-10-23T00:00:00.000Z',
        versions: [{ version_id: state.active, percentage: state.percentage }],
      }] } })
    }
    assert.ok(url.endsWith(`/versions/${state.active}`))
    return Response.json({ success: true, result: { id: state.active, annotations: { 'workers/message': state.message } } })
  }
  const run = async (command, args, options) => {
    state.runs.push({ command, args, options })
    state.active = versionId
    state.message = deploymentMessage(identity)
    await writeFile(options.env.WRANGLER_OUTPUT_FILE_PATH, `${JSON.stringify({
      type: 'deploy',
      worker_name: docsTargets[channel].worker,
      wrangler_environment: docsTargets[channel].environment,
      version_id: versionId,
    })}\n`)
  }
  return { root, env, channel, request, run, state, artifact }
}

test('local builds default to preview and reject unknown channels or mismatched URLs', () => {
  assert.deepEqual(buildIdentity({}, 'a'.repeat(40)), {
    channel: 'preview',
    sourceSha: 'a'.repeat(40),
    releaseId: '',
    deploymentId: '',
  })
  assert.throws(() => buildIdentity({ REPO_DOCS_CHANNEL: 'production' }), /Unknown documentation channel/u)
  assert.throws(() => buildIdentity({ REPO_DOCS_URL: docsTargets.stable.url }), /URL does not match/u)
  assert.throws(() => buildIdentity({ REPO_DOCS_CHANNEL: 'stable' }), /Direct documentation deployment/u)
})

test('stable deployment requires the exact release, workflow and site identity', async (t) => {
  const { env } = await fixture(t, 'stable')
  assert.doesNotThrow(() => assertDeploymentContext(env, 'stable'))
  for (const [key, value] of Object.entries({
    REPO_DOCS_SITE: 'other',
    REPO_DOCS_CHANNEL: 'preview',
    REPO_DOCS_SOURCE_SHA: 'main',
    REPO_DOCS_DEPLOYMENT_ID: 'invalid',
    REPO_DOCS_RESULT_FILE: '',
    REPO_DOCS_URL: docsTargets.preview.url,
    REPO_DOCS_RELEASE_ID: '',
    GITHUB_ACTIONS: 'false',
    GITHUB_RUN_ID: '',
    REPO_DOCS_CONCURRENCY_GROUP: 'docs-website-preview',
  })) {
    assert.throws(() => assertDeploymentContext({ ...env, [key]: value }, 'stable'), /Direct documentation|Stable documentation/u, key)
  }
})

test('a mismatched build cannot reach Cloudflare or Wrangler', async (t) => {
  const f = await fixture(t)
  await writeFile(f.artifact, JSON.stringify({ ...buildIdentity(f.env), sourceSha: 'e'.repeat(40) }))
  await assert.rejects(deployDocumentation(f), /artifact does not match/u)
  assert.equal(f.state.requests.length, 0)
  assert.equal(f.state.runs.length, 0)
  await assert.rejects(access(f.env.REPO_DOCS_RESULT_FILE))
})

test('a new preview uploads only its Worker and writes the confirmed version receipt', async (t) => {
  const f = await fixture(t)
  const result = await deployDocumentation(f)
  assert.deepEqual(result, { versionId, url: docsTargets.preview.url })
  assert.deepEqual(JSON.parse(await readFile(f.env.REPO_DOCS_RESULT_FILE, 'utf8')), result)
  assert.equal(f.state.runs.length, 1)
  const run = f.state.runs[0]
  assert.equal(run.command, 'pnpm')
  assert.deepEqual(run.args, ['exec', 'wrangler', 'deploy', '--env', 'preview', '--message', deploymentMessage(buildIdentity(f.env))])
  assert.equal(run.options.cwd, path.join(f.root, 'apps/docs'))
  await assert.rejects(access(path.dirname(run.options.env.WRANGLER_OUTPUT_FILE_PATH)))
})

test('stable deployment selects the existing production Worker', async (t) => {
  const f = await fixture(t, 'stable')
  const result = await deployDocumentation(f)
  assert.equal(result.url, 'https://panda.weapp.dev')
  assert.equal(f.state.runs[0].args[4], '')
})

test('retry after a lost upload response recovers the active version without uploading again', async (t) => {
  const f = await fixture(t)
  await assert.rejects(deployDocumentation({ ...f, run: async (...args) => {
    await f.run(...args)
    throw new Error('Upload response lost')
  } }), /Upload response lost/u)
  await assert.rejects(access(f.env.REPO_DOCS_RESULT_FILE))
  await assert.rejects(access(path.dirname(f.state.runs[0].options.env.WRANGLER_OUTPUT_FILE_PATH)))
  const result = await deployDocumentation(f)
  assert.equal(result.versionId, versionId)
  assert.equal(f.state.runs.length, 1)
  assert.deepEqual(JSON.parse(await readFile(f.env.REPO_DOCS_RESULT_FILE, 'utf8')), result)
})

test('an unrelated active version is replaced instead of incorrectly recovered', async (t) => {
  const f = await fixture(t)
  f.state.active = otherVersionId
  f.state.message = 'unrelated deployment'
  assert.equal((await deployDocumentation(f)).versionId, versionId)
  assert.equal(f.state.runs.length, 1)
})

test('conflicting upload and active versions never produce a success receipt', async (t) => {
  const f = await fixture(t)
  await assert.rejects(deployDocumentation({ ...f, run: async (...args) => {
    await f.run(...args)
    f.state.active = otherVersionId
  } }), /not confirmed active/u)
  await assert.rejects(access(f.env.REPO_DOCS_RESULT_FILE))
  await assert.rejects(access(path.dirname(f.state.runs[0].options.env.WRANGLER_OUTPUT_FILE_PATH)))
})

test('provider permission failures do not upload or advance the receipt', async (t) => {
  const f = await fixture(t)
  await assert.rejects(deployDocumentation({ ...f, request: async () => Response.json({ success: false, errors: [{ code: 10000 }] }, { status: 403 }) }), /HTTP 403/u)
  assert.equal(f.state.runs.length, 0)
  await assert.rejects(access(f.env.REPO_DOCS_RESULT_FILE))
})

test('split traffic is rejected before upload or recovery', async (t) => {
  const f = await fixture(t)
  f.state.active = versionId
  f.state.percentage = 50
  await assert.rejects(deployDocumentation(f), /100% of traffic/u)
  assert.equal(f.state.runs.length, 0)
  await assert.rejects(access(f.env.REPO_DOCS_RESULT_FILE))
})

test('Wrangler receipts must match the selected Worker, environment and valid version', () => {
  const output = JSON.stringify({ type: 'deploy', worker_name: docsTargets.preview.worker, wrangler_environment: 'preview', version_id: versionId })
  assert.equal(readDeploymentVersion(`${output}\n`, docsTargets.preview.worker, 'preview'), versionId)
  assert.throws(() => readDeploymentVersion(output, docsTargets.stable.worker, ''), /did not report/u)
  assert.throws(() => readDeploymentVersion(output, docsTargets.preview.worker, ''), /did not report/u)
  assert.throws(() => readDeploymentVersion(output.replace(versionId, 'invalid'), docsTargets.preview.worker, 'preview'), /did not report/u)
  assert.throws(() => readDeploymentVersion('not json', docsTargets.preview.worker, 'preview'), SyntaxError)
})

test('invalid credentials and provider response shapes fail closed', async () => {
  assert.throws(() => cloudflareClient({}), /CLOUDFLARE_API_TOKEN/u)
  assert.throws(() => cloudflareClient({ CLOUDFLARE_API_TOKEN: 'test', CLOUDFLARE_ACCOUNT_ID: 'invalid' }), /CLOUDFLARE_ACCOUNT_ID/u)
  await assert.rejects(activeMatchingVersion(async () => ({}), 'docs', {}), /invalid deployments/u)
  const deployments = { deployments: [{ created_on: '2026-10-23', versions: [{ version_id: 'invalid', percentage: 100 }] }] }
  await assert.rejects(activeMatchingVersion(async () => deployments, 'docs', {}), /invalid active version/u)
})
