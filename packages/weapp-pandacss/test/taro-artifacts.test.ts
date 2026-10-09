import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import postcss from 'postcss'
import selectorParser from 'postcss-selector-parser'

const run = promisify(execFile)

it.each([
  ['taro-app', [
    { color: 'red.400', bg: 'amber.800' },
    { borderWidth: '1px', borderRadius: '8px', paddingX: '12px', paddingY: '24px' },
    { bg: 'red.500', _hover: { bg: 'red.700' }, _active: { bg: 'red.900' } },
  ]],
  ['taro-app-vue3', [
    { bg: 'yellow.200', rounded: '9999px', fontSize: '90px', p: '10px 15px', color: 'pink.500' },
  ]],
])('matches real %s generated runtime classes with emitted WXSS', async (example, styles) => {
  const root = path.resolve(import.meta.dirname, '../../../examples', example)
  await run(process.execPath, ['../run-platform.mjs', 'taro', 'weapp', 'build', '--type', 'weapp'], { cwd: root, maxBuffer: 8 * 1024 * 1024 })
  const outdir = path.join(root, 'dist/weapp')
  let stylesheet = ''
  for (const file of await fs.readdir(outdir, {
    recursive: true,
  })) {
    if (file.endsWith('.wxss')) {
      stylesheet += await fs.readFile(path.join(outdir, file), 'utf8')
    }
  }
  expect(stylesheet.length).toBeGreaterThan(0)
  expect(stylesheet).not.toContain('@layer')
  expect(stylesheet).not.toContain(':where')
  expect(stylesheet).not.toContain(':not(#')
  const classes = new Set<string>()
  postcss.parse(stylesheet).walkRules((rule) => {
    selectorParser(selectors => selectors.walkClasses((node) => {
      classes.add(node.value)
    })).processSync(rule.selector)
  })
  const entry = pathToFileURL(path.join(root, 'styled-system/weapp/css/index.mjs')).href
  const script = `const {css}=await import(process.argv[1]); console.log(JSON.stringify(JSON.parse(process.argv[2]).map(style=>css(style))));`
  const values: string[] = JSON.parse((await run(process.execPath, ['--input-type=module', '-e', script, entry, JSON.stringify(styles)], { cwd: root })).stdout)
  for (const value of values) {
    expect(value).not.toBe('')
    for (const name of value.split(/\s+/)) {
      expect(name).toMatch(/^[\w-]+$/)
      expect(classes.has(name), `Missing ${example} selector: ${name}`).toBe(true)
    }
  }
}, 60_000)
