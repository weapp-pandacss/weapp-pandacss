import { encodeClassName } from '@weapp-pandacss/runtime'
import postcss from 'postcss'
import selectorParser from 'postcss-selector-parser'

/** Verify the shared multi-file import graph after an actual framework build. */
export function expectImportedArtifacts(css: string, target: 'web' | 'weapp', options: { pixelUnit?: 'px' | 'rpx' | 'rem', pixelScale?: number, finalImports?: string[] } = {}) {
  const root = postcss.parse(css)
  const names = [
    'import-normal',
    'import-important',
    'import-unlayered',
    'import-same-layer',
    'import-nested',
    'import/中文',
    'import_wp_2f_中文',
    'import.a',
    'import_wp_2e_a',
  ]
  const expectedName = (name: string) => encodeClassName(name)
  const declarations = new Map<string, { property: string, value: string, important: boolean }[]>()
  const imports: string[] = []
  root.walkAtRules('import', (rule) => {
    imports.push(rule.params)
  })
  // Uni-app adds an independent Tailwind WXSS import after PostCSS. Callers
  // declare that exact framework output; source CSS imports must be expanded.
  expect(imports).toEqual(options.finalImports ?? [])
  root.walkRules((rule) => {
    const classes = new Set<string>()
    selectorParser(selectors => selectors.walkClasses((node) => {
      classes.add(node.value)
    })).processSync(rule.selector)
    for (const name of names) {
      const token = expectedName(name)
      if (!classes.has(token)) {
        continue
      }
      const values = declarations.get(token) ?? []
      rule.walkDecls((declaration) => {
        values.push({ property: declaration.prop, value: declaration.value.replace(/\s+/g, ''), important: Boolean(declaration.important) })
      })
      declarations.set(token, values)
    }
  })
  const values = (name: string, property: string, important = false) => (declarations.get(expectedName(name)) ?? [])
    .filter(declaration => declaration.property === property && declaration.important === important)
    .map(declaration => declaration.value)
  for (const name of names) {
    expect(declarations.has(expectedName(name)), `Missing imported ${target} selector: ${name}`).toBe(true)
  }
  expect(expectedName('import/中文')).not.toBe(expectedName('import_wp_2f_中文'))
  expect(expectedName('import.a')).not.toBe(expectedName('import_wp_2e_a'))
  const pixelUnit = options.pixelUnit ?? 'px'
  const pixelScale = options.pixelScale ?? 1
  function expectLength(name: string, property: string, number: number, unit: string) {
    const lengths = values(name, property).map((value) => {
      const match = /^(-?(?:\d*\.)?\d+)([a-z]+)$/.exec(value)
      return match ? { number: Number(match[1]), unit: match[2] } : value
    })
    expect(lengths).toContainEqual({ number: Number(number.toFixed(10)), unit })
  }
  expectLength('import.a', 'margin-right', 7 * pixelScale, pixelUnit)
  expectLength('import_wp_2e_a', 'margin-right', 11 * pixelScale, pixelUnit)
  expect(values('import-same-layer', 'color')).toEqual(['#0284c7', 'var(--import-color,#16a34a)'])
  const unit = options.pixelUnit ?? (target === 'weapp' ? 'rpx' : 'px')
  expectLength('import/中文', 'padding-left', 16 * pixelScale, unit)
  expectLength('import_wp_2f_中文', 'padding-left', 24 * pixelScale, unit)
  expectLength('import-nested', 'margin-left', 8 * pixelScale, unit)
  if (target === 'weapp') {
    // Native layer order has been compiled into source order, including reversal
    // for important declarations and the position of unlayered declarations.
    expect(css).not.toContain('@layer')
    expect(values('import-normal', 'color')).toEqual(['#dc2626', '#0284c7'])
    expect(values('import-important', 'color', true)).toEqual(['#111827', '#0284c7', '#dc2626'])
    expect(values('import-unlayered', 'color')).toEqual(['#dc2626', '#0284c7', '#111827'])
  }
  else {
    expect(css).toContain('@layer')
    const layers: string[] = []
    root.walkAtRules('layer', (rule) => {
      if (!rule.nodes) {
        layers.push(...rule.params.split(',').map(name => name.trim()))
      }
    })
    expect(layers.indexOf('import-demo.base')).toBeGreaterThanOrEqual(0)
    expect(layers.indexOf('import-demo.utilities')).toBeGreaterThan(layers.indexOf('import-demo.base'))
    expect(values('import-normal', 'color')).toEqual(expect.arrayContaining(['#dc2626', '#0284c7']))
    expect(values('import-important', 'color', true)).toEqual(expect.arrayContaining(['#111827', '#0284c7', '#dc2626']))
    expect(values('import-unlayered', 'color')).toEqual(expect.arrayContaining(['#dc2626', '#0284c7', '#111827']))
  }
}
