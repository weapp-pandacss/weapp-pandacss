import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
// eslint-disable-next-line e18e/ban-dependencies -- Runs the native pnpm CLI on Windows and bounds network requests.
import { execa } from 'execa'
import { parseAllDocuments } from 'yaml'

interface Finding { version: string }
interface Advisory {
  github_advisory_id: string
  module_name: string
  severity: string
  findings: Finding[]
}
interface Audit {
  advisories: Record<string, Advisory>
  metadata: { vulnerabilities: Record<string, number> }
}
interface ReviewedAdvisory { id: string, module: string, severity: string, versions: string[] }
interface Baseline {
  schemaVersion: number
  advisories: ReviewedAdvisory[]
  vulnerabilities: Record<string, number>
  chains: Record<string, Record<string, string[]>>
}
interface Dependencies {
  dependencies?: Record<string, string | { version: string }>
  devDependencies?: Record<string, string | { version: string }>
  optionalDependencies?: Record<string, string | { version: string }>
}
interface Lockfile { importers: Record<string, Dependencies>, snapshots: Record<string, Dependencies> }

export function readWorkspaceLock(text: string): Lockfile {
  const documents = parseAllDocuments(text)
  for (const document of documents) {
    assert.equal(document.errors.length, 0, 'The lockfile must be valid YAML')
  }
  const workspaces = documents.map(document => document.toJS() as Lockfile)
    .filter(document => document?.importers && Object.hasOwn(document.importers, 'packages/weapp-pandacss'))
  assert.equal(workspaces.length, 1, 'Expected exactly one workspace lockfile document')
  assert(workspaces[0]?.snapshots, 'The workspace lockfile must contain resolved dependency snapshots')
  return workspaces[0]
}

// Keep every edge on an actual route from each importer to an affected version.
// Audit path lists are bounded and their enumeration order is not a risk delta.
export function dependencyChains(lock: Lockfile, targets: string[]): Baseline['chains'] {
  const adjacency = new Map<string, string[]>()
  function edges(node: Dependencies, importer?: string): string[] {
    const dependencies = { ...node.dependencies, ...node.optionalDependencies, ...(importer ? node.devDependencies : {}) }
    return Object.entries(dependencies).flatMap(([name, value]) => {
      const reference = typeof value === 'string' ? value : value.version
      if (reference.startsWith('link:')) {
        assert(importer, 'Only workspace importers may contain local workspace links')
        const linked = path.posix.normalize(path.posix.join(importer, reference.slice(5)))
        assert(Object.hasOwn(lock.importers, linked), `Unresolved workspace link: ${linked}`)
        return [`workspace:${linked}`]
      }
      const key = Object.hasOwn(lock.snapshots, reference) ? reference : `${name}@${reference}`
      assert(Object.hasOwn(lock.snapshots, key), `Unresolved dependency snapshot: ${key}`)
      return [key]
    }).sort()
  }
  for (const [name, dependencies] of Object.entries(lock.importers)) {
    adjacency.set(`workspace:${name}`, edges(dependencies, name))
  }
  for (const [name, dependencies] of Object.entries(lock.snapshots)) {
    adjacency.set(name, edges(dependencies))
  }
  const reverse = new Map<string, Set<string>>()
  for (const [parent, children] of adjacency) {
    for (const child of children) {
      const parents = reverse.get(child) ?? new Set<string>()
      parents.add(parent)
      reverse.set(child, parents)
    }
  }
  const output: Baseline['chains'] = {}
  for (const target of [...new Set(targets)].sort()) {
    const ancestors = new Set([...adjacency.keys()].filter(key => key.split('(')[0] === target))
    assert(ancestors.size, `Audited affected version is missing from the lockfile: ${target}`)
    const pending = [...ancestors]
    for (let cursor = 0; cursor < pending.length; cursor++) {
      for (const parent of reverse.get(pending[cursor]!) ?? []) {
        if (!ancestors.has(parent)) {
          ancestors.add(parent)
          pending.push(parent)
        }
      }
    }
    output[target] = {}
    for (const importer of Object.keys(lock.importers).sort()) {
      const start = `workspace:${importer}`
      if (!ancestors.has(start)) {
        continue
      }
      const visited = new Set([start])
      const queue = [start]
      const chains = new Set<string>()
      for (let cursor = 0; cursor < queue.length; cursor++) {
        const parent = queue[cursor]!
        for (const child of adjacency.get(parent) ?? []) {
          if (!ancestors.has(child)) {
            continue
          }
          // Peer-context suffixes are resolution bookkeeping; retain the
          // concrete package versions on each proven reachable edge.
          chains.add(`${parent.split('(')[0]} > ${child.split('(')[0]}`)
          if (!visited.has(child)) {
            visited.add(child)
            queue.push(child)
          }
        }
      }
      output[target][importer] = [...chains].sort()
    }
    assert(Object.keys(output[target]).length, `Affected version has no reachable workspace importer: ${target}`)
  }
  return output
}

export function compareAudit(audit: Audit, baseline: Baseline, lock: Lockfile) {
  assert.equal(baseline.schemaVersion, 1, 'Unsupported audit baseline format')
  assert(audit.advisories && !Array.isArray(audit.advisories) && audit.metadata?.vulnerabilities, 'pnpm audit must return advisories and vulnerability metadata')
  const levels = ['info', 'low', 'moderate', 'high', 'critical']
  const problems: string[] = []
  const advisories = Object.values(audit.advisories).map((item) => {
    assert(/^GHSA-[\w-]+$/.test(item.github_advisory_id), 'Every audit advisory must have a GHSA identity')
    assert(typeof item.module_name === 'string' && item.module_name.trim().length > 0, 'Every audit advisory must identify its affected module')
    assert(levels.includes(item.severity) && Array.isArray(item.findings) && item.findings.length > 0, 'Every audit advisory must have a known severity and affected findings')
    assert(item.findings.every(finding => typeof finding.version === 'string' && finding.version.length > 0), 'Every audit finding must identify its affected version')
    return { id: item.github_advisory_id, module: item.module_name, severity: item.severity, versions: [...new Set(item.findings.map(finding => finding.version))].sort() }
  })
  assert.equal(new Set(advisories.map(item => item.id)).size, advisories.length, 'Audit advisory identities must be unique')
  const reviewed = new Map(baseline.advisories.map(item => [item.id, item]))
  for (const advisory of advisories) {
    const previous = reviewed.get(advisory.id)
    if (!previous) {
      problems.push(`New advisory: ${advisory.id} (${advisory.module})`)
      continue
    }
    if (previous.module !== advisory.module || levels.indexOf(advisory.severity) > levels.indexOf(previous.severity)) {
      problems.push(`Changed module or increased severity: ${advisory.id}`)
    }
    for (const version of advisory.versions) {
      if (!previous.versions.includes(version)) {
        problems.push(`New affected version: ${advisory.id} ${advisory.module}@${version}`)
      }
    }
  }
  for (const level of levels) {
    const count = audit.metadata.vulnerabilities[level]
    assert(Number.isInteger(count) && count! >= 0, `Missing vulnerability count: ${level}`)
    assert.equal(advisories.filter(item => item.severity === level).length, count, `Incomplete advisory data for severity: ${level}`)
    if (count! > (baseline.vulnerabilities[level] ?? 0)) {
      problems.push(`Increased ${level} count: ${count} > ${baseline.vulnerabilities[level] ?? 0}`)
    }
  }
  const targets = advisories.flatMap(item => item.versions.map(version => `${item.module}@${version}`))
  const chains = dependencyChains(lock, targets)
  for (const [target, importers] of Object.entries(chains)) {
    for (const [importer, edges] of Object.entries(importers)) {
      const known = new Set(baseline.chains[target]?.[importer] ?? [])
      for (const edge of edges) {
        if (!known.has(edge)) {
          problems.push(`New affected dependency chain: ${target} from ${importer}: ${edge}`)
        }
      }
    }
  }
  return {
    passed: problems.length === 0,
    vulnerabilities: audit.metadata.vulnerabilities,
    removedAdvisories: baseline.advisories.filter(item => !advisories.some(current => current.id === item.id)).map(item => item.id),
    problems,
    chains,
  }
}

async function main() {
  if (process.argv.includes('--help')) {
    process.stdout.write('Compare a fresh pnpm audit with the reviewed GHSA/version/dependency-chain baseline. No baseline updates or vulnerability suppressions are performed.\n')
    return
  }
  assert.equal(process.argv.length, 2, 'This gate accepts no skip or baseline-update arguments')
  const root = path.resolve(import.meta.dirname, '..')
  const evidence = path.resolve(process.env['WEAPP_ACCEPTANCE_ARTIFACT_DIR'] ?? path.join(root, 'e2e-artifacts/audit'))
  await fs.mkdir(evidence, { recursive: true })
  const result = await execa('pnpm', ['audit', '--json'], { cwd: root, reject: false, timeout: 120_000 })
  await fs.writeFile(path.join(evidence, 'audit-current.json'), `${result.stdout}\n`)
  await fs.writeFile(path.join(evidence, 'audit-stderr.log'), `${result.stderr}\n`)
  assert(result.exitCode === 0 || result.exitCode === 1, 'The audit request failed to complete')
  const audit = JSON.parse(result.stdout) as Audit
  const baseline = JSON.parse(await fs.readFile(path.join(import.meta.dirname, 'audit-baseline.json'), 'utf8')) as Baseline
  const comparison = compareAudit(audit, baseline, readWorkspaceLock(await fs.readFile(path.join(root, 'pnpm-lock.yaml'), 'utf8')))
  await fs.writeFile(path.join(evidence, 'audit-comparison.json'), `${JSON.stringify(comparison, null, 2)}\n`)
  assert(comparison.passed, `Audit regression:\n${comparison.problems.join('\n')}`)
  process.stdout.write(`Audit baseline passed (${Object.keys(audit.advisories).length} retained advisories; existing vulnerabilities remain).\n`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
    process.exitCode = 1
  })
}
