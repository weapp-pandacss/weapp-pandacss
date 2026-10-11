import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { encodeClassName } from '@weapp-pandacss/runtime'
import postcss from 'postcss'
import selectorParser from 'postcss-selector-parser'
import { createPandaStyles } from '../../../examples/uni-app-vue3/panda-styles'

const cwd = path.resolve(import.meta.dirname, '../../../examples/uni-app-vue3')

it.each(['weapp', 'web'] as const)('tracks imports, source maps and changed dependencies in the Uni %s virtual entry', async (target) => {
  const fixture = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'panda-uni-imports-')))
  const entry = path.join(fixture, 'entry.css')
  const dependency = path.join(fixture, 'dependency.css')
  try {
    await fs.writeFile(entry, '@layer loader.base, loader.utilities;\n@import "./dependency.css" layer(loader.utilities);')
    await fs.writeFile(dependency, '.loader\\/中文 { color: #0284c7; }')
    const plugin = createPandaStyles({ cwd, entry, target })
    const watchFiles = new Set<string>()
    const context = {
      warn() {},
      addWatchFile(file: string) {
        watchFiles.add(file)
      },
    }
    const load = typeof plugin.load === 'function' ? plugin.load : plugin.load!.handler
    const render = async (id: string) => await Reflect.apply(load, context, [id]) as { code: string, map: { sources: string[] } } | undefined
    expect(await render('/unrelated.css')).toBeUndefined()
    const first = (await render('\0virtual:panda-styles.css'))!
    expect(watchFiles).toContain(entry)
    expect(watchFiles).toContain(dependency)
    expect(first.map.sources.some(source => source.endsWith('dependency.css'))).toBe(true)
    expect(first.code.includes('@layer')).toBe(target === 'web')
    const values = (code: string) => {
      const result: string[] = []
      postcss.parse(code).walkRules((rule) => {
        let matched = false
        selectorParser(selectors => selectors.walkClasses((node) => {
          matched ||= node.value === (target === 'weapp' ? encodeClassName('loader/中文') : 'loader/中文')
        })).processSync(rule.selector)
        if (matched) {
          rule.walkDecls('color', (declaration) => {
            result.push(declaration.value)
          })
        }
      })
      return result
    }
    expect(values(first.code)).toEqual(['#0284c7'])
    const previous = await fs.stat(dependency)
    await fs.writeFile(dependency, '.loader\\/中文 { color: #dc2626; }')
    await fs.utimes(dependency, previous.atime, new Date(previous.mtimeMs + 2000))
    const second = (await render('\0virtual:panda-styles.css'))!
    expect(values(second.code)).toEqual(['#dc2626'])
    expect(second.code).not.toBe(first.code)
  }
  finally {
    await fs.rm(fixture, { recursive: true, force: true })
  }
})

it('forwards early layer warnings with the imported source location to Vite', async () => {
  const fixture = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'panda-uni-warning-')))
  const entry = path.join(fixture, 'entry.css')
  const dependency = path.join(fixture, 'dependency.css')
  try {
    await fs.writeFile(entry, '@layer loader.base, loader.utilities;\n@import "./base.css" layer(loader.base);\n@import "./dependency.css" layer(loader.utilities);')
    await fs.writeFile(path.join(fixture, 'base.css'), '#loader-id { color: red; }')
    await fs.writeFile(dependency, '.loader { color: blue; }')
    const plugin = createPandaStyles({ cwd, entry, target: 'weapp' })
    const warnings: { message: string, loc?: { file: string, line: number, column: number } }[] = []
    const context = {
      addWatchFile() {},
      warn(warning: typeof warnings[number]) {
        warnings.push(warning)
      },
    }
    const load = typeof plugin.load === 'function' ? plugin.load : plugin.load!.handler
    await Reflect.apply(load, context, ['\0virtual:panda-styles.css'])
    const warning = warnings.find(item => item.message.includes('[WP_LAYER_SPECIFICITY]'))
    expect(warning).toBeDefined()
    expect(warning!.loc).toEqual({ file: dependency, line: 1, column: 0 })
  }
  finally {
    await fs.rm(fixture, { recursive: true, force: true })
  }
})
