import type { Plugin, Result } from 'postcss'
import path from 'node:path'
import postcss from 'postcss'
import { namingMarker } from '@/constants'
import { pipelinePlugin } from '@/postcss/pipeline'
import { useOptions } from '@/postcss/plugins'

it('restores all outer visitors after a units fallback dirties only part of an adapted tree', () => {
  const { optionsRef } = useOptions({
    imports: false,
    panda: false,
    units: { rules: [{ from: 'rem', to: 'rpx', factor: 32 }], replace: false },
  })
  const adapter: Plugin = {
    postcssPlugin: 'adapter-with-visitors',
    Declaration() {},
  }
  const visited: string[] = []
  const framework: Plugin = {
    postcssPlugin: 'outer-framework',
    Declaration(decl) {
      visited.push(`${decl.prop}:${decl.value}`)
    },
  }
  postcss([pipelinePlugin(optionsRef, [adapter]), framework])
    .process('.a{width:1rem;color:red}', { from: undefined })
    .sync()

  expect(visited).toEqual(['width:1rem', 'width:32rpx', 'color:red'])
})

it('restores clean descendants when the final adapter exit dirties their parent', () => {
  const { optionsRef } = useOptions({ imports: false, panda: false })
  const adapter: Plugin = {
    postcssPlugin: 'adapter-with-exit-mutation',
    Declaration() {},
    OnceExit(root) {
      root.walkDecls('width', (decl) => {
        if (decl.value === '1rem') {
          decl.cloneAfter({ value: '32rpx' })
        }
      })
    },
  }
  const visited: string[] = []
  postcss([
    pipelinePlugin(optionsRef, [adapter]),
    { postcssPlugin: 'outer-framework', Declaration(decl) { visited.push(`${decl.prop}:${decl.value}`) } },
  ]).process('.a{width:1rem;color:red}', { from: undefined }).sync()

  expect(visited).toEqual(['width:1rem', 'width:32rpx', 'color:red'])
})

it('preserves node identity, sources and markers while restoring all outer node visitors', () => {
  const { optionsRef } = useOptions({ imports: false, panda: false })
  const root = postcss.parse('/* retained */@media screen{.a{width:1rem;color:red}}', { from: '/src/entry.css' })
  const originalRule = (root.nodes[1] as postcss.AtRule).nodes![0]!
  Object.assign(originalRule, { [namingMarker]: true })
  const originalSource = originalRule.source
  const visited: string[] = []
  const adapter: Plugin = {
    postcssPlugin: 'adapter-with-visitors',
    Declaration() {},
    OnceExit(css) {
      css.walkDecls('width', (decl) => {
        if (decl.value === '1rem') {
          decl.cloneAfter({ value: '32rpx' })
        }
      })
    },
  }
  const framework: Plugin = {
    postcssPlugin: 'framework-all-nodes',
    Comment(comment) { visited.push(`comment:${comment.text}`) },
    AtRule(atRule) { visited.push(`at:${atRule.name}`) },
    Rule(rule) {
      visited.push(`rule:${rule.selector}`)
      expect(rule.source).toBe(originalSource)
      expect((rule as typeof rule & { [namingMarker]?: boolean })[namingMarker]).toBe(true)
    },
    Declaration(decl) { visited.push(`decl:${decl.prop}:${decl.value}`) },
    OnceExit() { visited.push('exit') },
  }
  const result = postcss([pipelinePlugin(optionsRef, [adapter]), framework])
    .process(root, { from: '/src/entry.css', to: '/dist/out.css', map: { inline: false } })

  expect(result.css).toContain('width:32rpx')
  expect((root.nodes[1] as postcss.AtRule).nodes![0]).toBe(originalRule)
  expect(visited).toEqual(['comment:retained', 'at:media', 'rule:.a', 'decl:width:1rem', 'decl:width:32rpx', 'decl:color:red', 'exit'])
  expect(result.map!.toJSON().sources).toEqual(['../src/entry.css'])
})

it('keeps empty roots valid and runs the outer exit after a converter-only sync pass', () => {
  const { optionsRef } = useOptions({ imports: false, panda: false, adapter: false, units: { rules: [{ from: 'rem', to: 'rpx', factor: 32 }] } })
  const OnceExit = vi.fn()
  const root = postcss.parse('')
  const result = postcss([pipelinePlugin(optionsRef, []), { postcssPlugin: 'outer-exit', OnceExit }])
    .process(root, { from: undefined })
    .sync()

  expect(result.root).toBe(root)
  expect(result.root.nodes).toHaveLength(0)
  expect(OnceExit).toHaveBeenCalledOnce()
})

it('forwards adapter diagnostics exactly once when its sync lifecycle fails', () => {
  const { optionsRef } = useOptions({ imports: false, panda: false })
  const failure = new Error('adapter failed')
  let result: Result | undefined
  const adapter: Plugin = {
    postcssPlugin: 'failing-adapter',
    Declaration() {},
    OnceExit(_root, { result }) {
      result.warn('retained diagnostic', { plugin: 'failing-adapter' })
      throw failure
    },
  }
  const capture: Plugin = {
    postcssPlugin: 'capture-result',
    prepare(value) {
      result = value
      return {}
    },
  }
  const lazy = postcss([capture, pipelinePlugin(optionsRef, [adapter])]).process('.a{width:1rem}', { from: undefined })

  expect(() => lazy.sync()).toThrow(failure)
  expect(result!.messages).toEqual([expect.objectContaining({ type: 'warning', text: 'retained diagnostic', plugin: 'failing-adapter' })])
})

it.each([undefined, path.resolve('source-less-units.css')])('converts programmatic ASTs without inventing source metadata: %s', (from) => {
  const root = postcss.root().append(postcss.rule({ selector: '.a' }).append({ prop: 'width', value: '-2rem' }))
  const contexts: Array<{ file: string | undefined, value: number }> = []
  const plugin = pipelinePlugin(useOptions({
    imports: false,
    panda: false,
    adapter: false,
    units: {
      rules: [{
        from: 'rem',
        to: 'rpx',
        transform(value, context) {
          contexts.push({ file: context.input.file, value })
          return value * 32
        },
      }],
    },
  }).optionsRef, [])
  const result = postcss([plugin]).process(root, { from, map: { inline: false, annotation: false } })

  expect(result.css).toContain('width: -64rpx')
  expect(contexts).toEqual([{ file: from, value: -2 }])
  expect(root.source).toBeUndefined()
  root.walk(node => expect(node.source).toBeUndefined())
  expect(result.map!.toJSON().sources).toEqual(['<no source>'])
})
