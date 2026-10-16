import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { parseArgs } from 'node:util'
import { runInstalledScenario, writeInstalledScenario } from './installed-scenarios.ts'
import { installPackedConsumer, packPackages, pandaVersions, run } from './packed-consumer.ts'

async function main() {
  const { values } = parseArgs({ options: { node22: { type: 'string' }, node24: { type: 'string' }, evidence: { type: 'string' } } })
  const nodes = [
    { binary: values.node22 ?? process.env['WEAPP_PANDACSS_NODE22'], expected: 'v22.18.0' },
    { binary: values.node24 ?? process.env['WEAPP_PANDACSS_NODE24'], expected: 'v24.11.0' },
  ]
  const evidence = path.resolve(values.evidence ?? 'artifacts/consumer-acceptance')
  await fs.mkdir(evidence, { recursive: true })
  for (const node of nodes) {
    assert(node.binary, `Supply ${node.expected} using --node${node.expected.slice(1, 3)} or WEAPP_PANDACSS_NODE${node.expected.slice(1, 3)}`)
    assert.equal((await run(node.binary, ['--version'])).stdout.trim(), node.expected)
  }
  const packages = await packPackages(evidence)
  const tarballs = await Promise.all(Object.entries(packages).map(async ([name, file]) => ({ name, file, sha256: createHash('sha256').update(await fs.readFile(file)).digest('hex') })))
  const matrix = []
  for (const node of nodes) {
    for (const version of pandaVersions) {
      const root = path.join(evidence, `node-${node.expected.slice(1)}-panda-${version}`)
      await installPackedConsumer(root, packages, version, node.binary)
      await writeInstalledScenario(root)
      const scenario = await runInstalledScenario(root, node.binary)
      matrix.push({ node: scenario.node, panda: scenario.panda, negative: scenario.negative, modes: scenario.modes, diagnostics: scenario.diagnostics, validation: scenario.validation, root })
      process.stdout.write(`Passed ${scenario.node} / Panda ${scenario.panda}\n`)
    }
  }
  await fs.writeFile(path.join(evidence, 'consumer-report.json'), JSON.stringify({ tarballs, matrix }, null, 2))
  process.stdout.write(`Consumer evidence: ${evidence}\n`)
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
  process.exitCode = 1
})
