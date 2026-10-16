import type { PackedPackages } from './packed-consumer'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { runInstalledScenario, writeInstalledScenario } from './installed-scenarios'
import { installPackedConsumer, packPackages, pandaVersions } from './packed-consumer'

let root: string
let packages: PackedPackages

beforeAll(async () => {
  root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'panda-installed-')))
  packages = await packPackages(root)
}, 60_000)

afterAll(async () => {
  if (root) {
    await fs.rm(root, { recursive: true, force: true })
  }
})

it.each(pandaVersions)('installs both local tarballs with Panda %s and executes extracted/static runtime scenarios', async (version) => {
  const consumer = path.join(root, `consumer-${version}`)
  const { resolution } = await installPackedConsumer(consumer, packages, version)
  await writeInstalledScenario(consumer)
  const scenario = await runInstalledScenario(consumer)
  expect(scenario.panda).toBe(version)
  expect(scenario.node).toBe(resolution.node)
  expect(scenario.negative).toHaveLength(11)
}, 120_000)
