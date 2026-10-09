import postcss from 'postcss'
import adapter from '@/postcss'
import { orderedLayersPlugin } from '@/postcss/layers'
import { useOptions } from '@/postcss/plugins'

function compile(css: string, onConflict: 'warning' | 'error' = 'warning') {
  return postcss([orderedLayersPlugin(onConflict)]).process(css, { from: 'layers.css', to: 'output.wxss', map: { inline: false } })
}

function declarations(css: string) {
  const values: string[] = []
  postcss.parse(css).walkDecls((decl) => {
    values.push(`${decl.prop}:${decl.value}${decl.important ? '!' : ''}`)
  })
  return values
}

it('sorts declared layers despite reversed block order and retains unlayered priority', async () => {
  const result = await compile('.x{color:green} @layer base,utilities; @layer utilities{.x{color:blue}} @layer base{.x{color:red}}')
  expect(declarations(result.css)).toEqual(['color:red', 'color:blue', 'color:green'])
  expect(result.warnings()).toEqual([])
  expect(result.css).not.toContain('@layer')
  expect(result.css).not.toContain(':not(')
})

it('splits important declarations, reverses layer order and retains same-layer fallback order', async () => {
  const result = await compile('@layer a,b; @layer a{.x{/*once*/color:red!important;background:red;color:orange!important}} @layer b{.x{color:blue!important;background:blue}} .x{color:green!important;background:green}')
  expect(declarations(result.css)).toEqual(['background:red', 'background:blue', 'background:green', 'color:green!', 'color:blue!', 'color:red!', 'color:orange!'])
  expect(result.css.match(/once/g)).toHaveLength(1)
  expect(result.warnings()).toEqual([])
})

it('registers dotted and nested layers, with implicit parent rules last for normal and first for important', async () => {
  const result = await compile('@layer outer.a,outer.b,last; @layer outer{.x{color:parent;color:parent!important} @layer b{.x{color:b;color:b!important}} @layer a{.x{color:a;color:a!important}}} @layer last{.x{color:last;color:last!important}}')
  expect(declarations(result.css)).toEqual(['color:a', 'color:b', 'color:parent', 'color:last', 'color:last!', 'color:parent!', 'color:b!', 'color:a!'])
})

it('preserves repeated layer source order, anonymous identity, empty rules and ordinary comments', async () => {
  const result = await compile('@layer a{.x{color:first}.empty{}} @layer{.x{color:anonymous}} @layer a{.x{color:second}} @layer { .x{color:other}} @layer unused; @layer empty{} /*end*/')
  expect(declarations(result.css)).toEqual(['color:first', 'color:second', 'color:anonymous', 'color:other'])
  expect(result.css).toContain('.empty{}')
  expect(result.css).toContain('/*end*/')
})

it('distinguishes escaped dots in a single identifier from layer path separators', async () => {
  const result = await compile('@layer a\\.b,a.b; @layer a.b{.x{color:nested}} @layer a\\.b{.x{color:literal}}')
  expect(declarations(result.css)).toEqual(['color:literal', 'color:nested'])
})

it('keeps conditional wrappers and all descriptor at-rules intact without duplication', async () => {
  const css = '@layer a,b; @media (min-width:1px){@supports (display:grid){@layer b{.x{color:blue!important;background:blue}}}} @layer a{@keyframes spin{from{opacity:0!important}to{opacity:1}} @-webkit-keyframes alt{to{opacity:1}} @font-face{font-family:test;src:url(test)} @property --x{syntax:"<color>";inherits:false;initial-value:red} .x{color:red!important;background:red}}'
  const result = await compile(css)
  result.root.walk((node) => {
    expect(node.parent).toBeDefined()
    expect(node.parent!.nodes).toContain(node)
  })
  const root = postcss.parse(result.css)
  expect(result.warnings()).toEqual([])
  const blue: string[][] = []
  root.walkDecls('background', (decl) => {
    if (decl.value === 'blue') {
      blue.push([decl.parent!.parent!.type, (decl.parent!.parent as postcss.AtRule).name, ((decl.parent!.parent!.parent) as postcss.AtRule).name])
    }
  })
  expect(blue).toEqual([['atrule', 'supports', 'media']])
  for (const name of ['keyframes', '-webkit-keyframes', 'font-face', 'property']) {
    const rules: postcss.AtRule[] = []
    root.walkAtRules(name, (node) => {
      rules.push(node)
    })
    expect(rules).toHaveLength(1)
  }
  expect(result.css).toContain('opacity:0!important')
})

it('preserves import/charset/namespace prologues and source mapping', async () => {
  const result = await compile('@charset "UTF-8"; @import "plain.css"; @namespace svg "http://www.w3.org/2000/svg";\n@layer a{.x{color:red}}')
  expect(result.css.indexOf('@charset')).toBeLessThan(result.css.indexOf('.x'))
  expect(result.map!.toJSON().sourcesContent).toEqual(['@charset "UTF-8"; @import "plain.css"; @namespace svg "http://www.w3.org/2000/svg";\n@layer a{.x{color:red}}'])
})

it('preserves unfamiliar descriptor at-rules atomically and maintains unfamiliar rule wrappers', async () => {
  const result = await compile('@layer a; @layer a{@font-palette-values --palette{font-family:test;base-palette:0} @custom-rule{.x{color:red!important}} @custom-container{@media (width:1px){.y{color:blue}}} @future-descriptor{/*comment*/value:x}}')
  expect(result.css).toContain('@font-palette-values --palette{font-family:test;base-palette:0}')
  expect(result.css).toContain('@custom-rule{.x{color:red!important}}')
  expect(result.css).toContain('@future-descriptor{/*comment*/value:x}')
  expect(result.css).toContain('@custom-container{@media (width:1px){.y{color:blue}}}')
  expect(result.warnings()).toEqual([])
})

it('is byte-stable across parse/serialize passes and processor reuse', async () => {
  const processor = postcss([orderedLayersPlugin('warning')])
  const first = await processor.process('@layer b,a; @layer a{.x{color:red!important}} @layer b{.x{color:blue}}', { from: undefined })
  const second = await processor.process(first.css, { from: undefined })
  const separate = await processor.process('@layer a,b; @layer b{.x{color:red}} @layer a{.x{color:blue}}', { from: undefined })
  expect(second.css).toBe(first.css)
  expect(declarations(separate.css)).toEqual(['color:blue', 'color:red'])
})

it('does not reorder no-layer inputs, split standalone important rules or interpret strings as keywords', async () => {
  const css = '@import "layer.css"; .x:not(.disabled){color:red!important;content:"revert-layer"}'
  expect((await compile(css)).css).toContain(css)
})

it.each([
  ['@import "x" layer(foo);', 'Inline @import'],
  ['@import url(x) layer;', 'Inline @import'],
  ['.x{color:revert-layer}', 'revert-layer'],
  ['.x{color:var(--x, REVERT-LAYER)}', 'revert-layer'],
  ['.x{.y{color:red}}', 'nested style rules'],
  ['.x{@media (width:1px){.y{color:red}}}', 'nested style rules'],
  ['&.x{color:red}', 'nesting selectors'],
  ['.x{@layer a{color:red}}', '@layer must be outside'],
  ['@font-face{@layer a{font-family:x}}', 'descriptor at-rules'],
  ['.x:not(#\\#){color:red}', 'Disable Panda polyfill'],
  ['@layer;', 'anonymous @layer'],
  ['@layer a,b{.x{color:red}}', 'exactly one layer name'],
  ['@layer .a{.x{color:red}}', 'Invalid @layer name'],
  ['@layer a b;', 'Invalid @layer name'],
  ['@layer a{color:red}', 'declarations must belong'],
  ['@layer a; @media (width:1px){color:red}', 'declarations must belong'],
  ['@layer a{@import "plain.css";}', 'cannot appear inside'],
  ['@media (width:1px){@namespace x "y";} @layer a;', 'cannot appear inside'],
])('rejects unsupported input %s with an actionable error', async (css, message) => {
  await expect(compile(css)).rejects.toThrow(message)
})

it.each([
  ['@media (width:1px){@layer a{.x{color:red}}} @layer b;', 'WP_LAYER_CONDITIONAL_ORDER'],
  ['@supports (display:grid){@layer {.x{color:red}}}', 'WP_LAYER_CONDITIONAL_ORDER'],
  ['@layer a,b; @layer a{.x:custom(.y){color:red}} @layer b{.x{color:blue}}', 'WP_LAYER_SELECTOR_UNKNOWN'],
  ['@layer a,b; @layer a{#id .x{color:red}} @layer b{.x{color:blue}}', 'WP_LAYER_SPECIFICITY'],
  ['@layer a,b; @layer b{#id .x{color:red!important}} @layer a{.x{color:blue!important}}', 'WP_LAYER_SPECIFICITY'],
  ['@layer a{#id .x{background:red}} .x{background-color:blue}', 'WP_LAYER_SPECIFICITY'],
  ['@layer a{#id .x{border:red}} .x{border-left-color:blue}', 'WP_LAYER_SPECIFICITY'],
  ['@layer a{#id .x{border:0}} .x{border-image-source:none}', 'WP_LAYER_SPECIFICITY'],
  ['@layer a{#id .x{font:16px serif}} .x{font-feature-settings:normal}', 'WP_LAYER_SPECIFICITY'],
  ['@layer a{#id .x{all:initial}} .x{color:blue}', 'WP_LAYER_SPECIFICITY'],
  ['@layer a{#id .x{color:red}} .x{all:initial}', 'WP_LAYER_SPECIFICITY'],
  ['@layer a{#id .x{margin-inline:1px}} .x{margin-left:2px}', 'WP_LAYER_SPECIFICITY'],
  ['@layer a{#id .x{unknown-prop:1}} .x{padding:2px}', 'WP_LAYER_SPECIFICITY'],
  ['@layer a{#id .x{--color:red}} .x{--color:blue}', 'WP_LAYER_SPECIFICITY'],
  ['@layer a{#id .x{-webkit-appearance:none}} .x{appearance:auto}', 'WP_LAYER_SPECIFICITY'],
])('diagnoses semantic risks %s and supports strict mode', async (css, code) => {
  const result = await compile(css)
  const warnings = result.warnings()
  expect(warnings.some(warning => warning.text.includes(code))).toBe(true)
  expect(warnings[0]!.line).toBeGreaterThan(0)
  expect(warnings[0]!.node!.source!.input.file).toMatch(/layers\.css$/)
  await expect(compile(css, 'error')).rejects.toThrow(code)
})

it.each([
  '@layer a,b; @layer a{#id .x{--color:red}} @layer b{.x{all:initial}}',
  '@layer a,b; @layer a{#id .x{all:initial}} @layer b{.x{--color:red;direction:rtl;unicode-bidi:isolate}}',
  '@layer a,b; @layer a{#id .x{color:red}} @layer b{.x{padding:1px}}',
  '@layer a{#id .x{color:red}.x{color:blue}}',
])('does not diagnose same-layer or non-overlapping properties %s', async (css) => {
  expect((await compile(css)).warnings()).toEqual([])
})

it('keeps old options explicit and rejects contradictory modes', async () => {
  expect(useOptions().optionsRef.value.cascadeLayers).toEqual({ mode: 'ordered', onConflict: 'warning' })
  for (const options of [{ removeNegationPseudoClass: true }, { cascadeLayersPluginOptions: {} }, { selectorReplacement: { cascadeLayers: 'custom' } }]) {
    expect(useOptions(options).optionsRef.value.cascadeLayers.mode).toBe('legacy')
    expect(() => useOptions({ ...options, cascadeLayers: { mode: 'ordered' } })).toThrow('cannot be combined')
  }
  expect(useOptions({ cascadeLayers: { mode: 'legacy' } }).optionsRef.value.cascadeLayers.mode).toBe('legacy')
})

it('integrates ordered naming and platform transforms without altering handwritten negation', async () => {
  const css = '@layer a,b; @layer b{.a\\/b:not(.disabled){color:blue}} @layer a{.a\\/b{color:red}}'
  const first = await postcss([adapter()]).process(css, { from: undefined })
  expect(first.css).toContain('.a_wp_2f_b:not(.disabled)')
  expect(first.css).not.toContain(':not(n)')
  expect(declarations(first.css)).toEqual(['color:red', 'color:blue'])
  expect((await postcss([adapter()]).process(first.css, { from: undefined })).css).toBe(first.css)
  expect((await postcss([adapter({ target: 'web' })]).process(css, { from: undefined })).css).toContain('@layer a,b;')
  expect((await postcss([adapter({ disabled: true })]).process(css, { from: undefined })).css).toBe(css)
})
