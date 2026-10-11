import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import postcss from 'postcss'
import selectorParser from 'postcss-selector-parser'
import { expectImportedArtifacts } from './import-artifact-assertions'

const run = promisify(execFile)

const examples = [
  ['taro-app', [
    { color: 'red.400', bg: 'amber.800' },
    { borderWidth: '1px', borderRadius: '8px', paddingX: '12px', paddingY: '24px' },
    { bg: 'red.500', _hover: { bg: 'red.700' }, _active: { bg: 'red.900' } },
  ]],
  ['taro-app-vue3', [
    { bg: 'yellow.200', rounded: '9999px', fontSize: '90px', p: '10px 15px', color: 'pink.500' },
  ]],
] as const

it.each(examples.flatMap(([example, styles]) => ['weapp', 'h5'].map(target => ({ example, styles, target }))))('matches real $example $target runtime classes and imported CSS with emitted styles', async ({ example, styles, target }) => {
  const root = path.resolve(import.meta.dirname, '../../../examples', example)
  await run(process.execPath, ['../run-platform.mjs', 'taro', target, 'build', '--type', target], { cwd: root, maxBuffer: 8 * 1024 * 1024 })
  const outdir = path.join(root, 'dist', target)
  let stylesheet = ''
  for (const file of await fs.readdir(outdir, {
    recursive: true,
  })) {
    if (file.endsWith(target === 'weapp' ? '.wxss' : '.css')) {
      stylesheet += await fs.readFile(path.join(outdir, file), 'utf8')
    }
  }
  expect(stylesheet.length).toBeGreaterThan(0)
  if (target === 'weapp') {
    expect(stylesheet).not.toContain('@layer')
    expect(stylesheet).not.toContain(':where')
    expect(stylesheet).not.toContain(':not(#')
  }
  expectImportedArtifacts(stylesheet, target === 'weapp' ? 'weapp' : 'web', {
    pixelUnit: target === 'weapp' ? 'rpx' : 'rem',
    pixelScale: target === 'weapp' ? 1 : 1 / 40,
  })
  const classes = new Set<string>()
  postcss.parse(stylesheet).walkRules((rule) => {
    selectorParser(selectors => selectors.walkClasses((node) => {
      classes.add(node.value)
    })).processSync(rule.selector)
  })
  const entry = pathToFileURL(path.join(root, 'styled-system', target, 'css/index.mjs')).href
  const script = `const {css}=await import(process.argv[1]); console.log(JSON.stringify(JSON.parse(process.argv[2]).map(style=>css(style))));`
  const values: string[] = JSON.parse((await run(process.execPath, ['--input-type=module', '-e', script, entry, JSON.stringify(styles)], { cwd: root })).stdout)
  for (const value of values) {
    expect(value).not.toBe('')
    for (const name of value.split(/\s+/)) {
      if (target === 'weapp') {
        expect(name).toMatch(/^[\w-]+$/)
      }
      expect(classes.has(name), `Missing ${example} selector: ${name}`).toBe(true)
    }
  }
}, 60_000)
