import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import postcss from 'postcss'
import selectorParser from 'postcss-selector-parser'

const run = promisify(execFile)
const root = path.resolve(import.meta.dirname, '../../../examples/uni-app-vue3')

it('builds matching Panda and Tailwind styles in Uni-app mini-program and H5 artifacts', async () => {
  for (const target of ['mp-weixin', 'h5']) {
    await run(process.execPath, ['../run-platform.mjs', 'uni', target, 'build', '-p', target], { cwd: root, maxBuffer: 4 * 1024 * 1024 })
    const outdir = path.join(root, 'dist/build', target)
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
    const classes = new Set<string>()
    postcss.parse(css).walkRules((rule) => {
      selectorParser(selectors => selectors.walkClasses((node) => {
        classes.add(node.value)
      })).processSync(rule.selector)
    })
    const entry = pathToFileURL(path.join(root, 'styled-system', target)).href
    const script = `const {css}=await import(process.argv[1]+'/css/index.mjs');const {token}=await import(process.argv[1]+'/tokens/index.mjs');console.log(JSON.stringify({classes:css({color:'red.300',bg:'blue.800',fontWeight:'semibold'}),variable:token.var('colors.red.300')}));`
    const values = JSON.parse((await run(process.execPath, ['--input-type=module', '-e', script, entry], { cwd: root })).stdout)
    for (const name of values.classes.split(' ')) {
      expect(classes.has(name), `Missing ${target} selector: ${name}`).toBe(true)
    }
    expect(css).toContain(`${values.variable.slice(4, -1)}:`)
  }
}, 60_000)
