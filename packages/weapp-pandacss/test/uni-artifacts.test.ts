import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import postcss from 'postcss'
import selectorParser from 'postcss-selector-parser'
import { expectImportedArtifacts, expectPreprocessedArtifacts, expectUnitToken } from './import-artifact-assertions'

const run = promisify(execFile)
const root = path.resolve(import.meta.dirname, '../../../examples/uni-app-vue3')

it.each(['mp-weixin', 'h5'])('builds matching Panda, imported and Tailwind styles in Uni-app %s artifacts', async (target) => {
  const outdir = path.join(root, 'dist/build', target)
  await fs.rm(outdir, { recursive: true, force: true })
  await run(process.execPath, ['../run-platform.mjs', 'uni', target, 'build', '-p', target], { cwd: root, env: { ...process.env, NODE_ENV: 'production' }, maxBuffer: 4 * 1024 * 1024 })
  let css = ''
  if (target === 'h5') {
    const html = await fs.readFile(path.join(outdir, 'index.html'), 'utf8')
    for (const match of html.matchAll(/href="([^"?]+\.css)"/g)) {
      css += await fs.readFile(path.join(outdir, match[1]!.replace(/^\//, '')), 'utf8')
    }
    expect(css).toContain('.hover\\:bg-blue-600:hover')
  }
  else {
    for (const file of await fs.readdir(outdir, {
      recursive: true,
    })) {
      if (file.endsWith('.wxss')) {
        css += await fs.readFile(path.join(outdir, file), 'utf8')
      }
    }
    expect(css).not.toContain('@layer')
    expect(css).not.toContain(':where')
    expect(css).toContain('.bg-blue-500')
  }
  expectImportedArtifacts(css, target === 'h5' ? 'web' : 'weapp', {
    finalImports: target === 'h5' ? [] : ['"./tailwind.wxss"'],
  })
  expectPreprocessedArtifacts(css, { remUnit: target === 'h5' ? 'px' : 'rpx', remScale: 32 })
  const tailwindValues: { selector: string, property: string, value: string }[] = []
  postcss.parse(css).walkRules((rule) => {
    rule.walkDecls((declaration) => {
      if (rule.selector === '.unit-tailwind-fixture') {
        tailwindValues.push({ selector: rule.selector, property: declaration.prop, value: declaration.value })
      }
    })
  })
  expect(tailwindValues).toContainEqual({ selector: '.unit-tailwind-fixture', property: 'padding-left', value: `16${target === 'h5' ? 'px' : 'rpx'}` })
  expect(tailwindValues).toContainEqual({ selector: '.unit-tailwind-fixture', property: 'margin-top', value: `-8${target === 'h5' ? 'px' : 'rpx'}` })
  const classes = new Set<string>()
  postcss.parse(css).walkRules((rule) => {
    selectorParser(selectors => selectors.walkClasses((node) => {
      classes.add(node.value)
    })).processSync(rule.selector)
  })
  const entry = pathToFileURL(path.join(root, 'styled-system', target)).href
  const script = `const {css}=await import(process.argv[1]+'/css/index.mjs');const {token}=await import(process.argv[1]+'/tokens/index.mjs');console.log(JSON.stringify({classes:css({color:'red.300',bg:'blue.800',fontWeight:'semibold'}),variable:token.var('colors.red.300'),spacingVariable:token.var('spacing.unit-fixture')}));`
  const values = JSON.parse((await run(process.execPath, ['--input-type=module', '-e', script, entry], { cwd: root })).stdout)
  for (const name of values.classes.split(' ')) {
    expect(classes.has(name), `Missing ${target} selector: ${name}`).toBe(true)
  }
  expect(css).toContain(`${values.variable.slice(4, -1)}:`)
  expectUnitToken(css, { unit: target === 'h5' ? 'px' : 'rpx', scale: 32, variable: values.spacingVariable })
}, 60_000)
