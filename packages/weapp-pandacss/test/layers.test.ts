import type { CascadeLayerDiagnostic } from '@weapp-tailwindcss/css-compat/diagnostics'
import { CascadeLayerError } from '@weapp-tailwindcss/css-compat/diagnostics'
import postcss, { CssSyntaxError } from 'postcss'
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

it('preserves charset/namespace prologues and source mapping after imports are expanded', async () => {
  const result = await compile('@charset "UTF-8"; @namespace svg "http://www.w3.org/2000/svg";\n@layer a{.x{color:red}}')
  expect(result.css.indexOf('@charset')).toBeLessThan(result.css.indexOf('.x'))
  expect(result.map!.toJSON().sourcesContent).toEqual(['@charset "UTF-8"; @namespace svg "http://www.w3.org/2000/svg";\n@layer a{.x{color:red}}'])
})

it('preserves unfamiliar descriptor at-rules atomically and maintains unfamiliar rule wrappers', async () => {
  const result = await compile('@layer a; @layer a{@font-palette-values --palette{font-family:test;base-palette:0} @custom-rule{.x{color:red!important}} @custom-container{@media (width:1px){.y{color:blue}}} @future-descriptor{/*comment*/value:x}}')
  expect(result.css).toContain('@font-palette-values --palette{font-family:test;base-palette:0}')
  expect(result.css).toContain('@custom-rule{.x{color:red!important}}')
  expect(result.css).toContain('@future-descriptor{/*comment*/value:x}')
  expect(result.css).toContain('@custom-container{@media (width:1px){.y{color:blue}}}')
  expect(result.warnings().map(warning => (warning as typeof warning & { code: string }).code)).toEqual(['LAYER_WRAPPER_SEMANTICS', 'LAYER_WRAPPER_SEMANTICS'])
  await expect(compile('@layer a{@scope (.root){.x{color:red}}}', 'error')).rejects.toThrow('LAYER_WRAPPER_SEMANTICS')
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
  const css = '.x:not(.disabled){color:red!important;content:"revert-layer";background:url("revert-layer")}'
  expect((await compile(css)).css).toContain(css)
})

it.each([
  ['@import "plain.css";', 'LAYER_IMPORT'],
  ['@import "x" layer(foo);', 'LAYER_IMPORT'],
  ['@import url(x) layer;', 'LAYER_IMPORT'],
  ['.x{color:revert-layer}', 'LAYER_REVERT'],
  ['.x{color:var(--x, REVERT-LAYER)}', 'LAYER_REVERT'],
  ['.x{.y{color:red}}', 'LAYER_NESTING'],
  ['.x{@media (width:1px){.y{color:red}}}', 'LAYER_NESTING'],
  ['&.x{color:red}', 'LAYER_NESTING'],
  ['.x{@layer a{color:red}}', 'LAYER_NESTING'],
  ['@font-face{@layer a{font-family:x}}', 'LAYER_NESTING'],
  ['.x:not(#\\#){color:red}', 'Disable Panda polyfill'],
  ['@layer;', 'LAYER_NAME'],
  ['@layer a,b{.x{color:red}}', 'LAYER_NAME'],
  ['@layer .a{.x{color:red}}', 'LAYER_NAME'],
  ['@layer a b;', 'LAYER_NAME'],
  ['@layer a{color:red}', 'LAYER_NESTING'],
  ['@layer a; @media (width:1px){color:red}', 'LAYER_NESTING'],
  ['@layer a{@import "plain.css";}', 'LAYER_IMPORT'],
  ['@media (width:1px){@namespace x "y";} @layer a;', 'LAYER_IMPORT'],
  ['/* #ifdef MP-WEIXIN */ @layer a{.x{color:red}} /* #endif */', 'LAYER_PREPROCESSOR'],
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

it('retains legacy warning text and exposes structured upstream diagnostics', async () => {
  const css = '@layer a,b; @layer a{#id .x{color:red}}\n@layer b{.x{color:blue}}'
  const result = await compile(css)
  const warning = result.warnings()[0]! as postcss.Warning & { code: string, diagnostic: CascadeLayerDiagnostic }
  expect(warning.text).toContain('WP_LAYER_SPECIFICITY')
  expect(warning.code).toBe('LAYER_SPECIFICITY')
  expect(warning.diagnostic).toMatchObject({
    severity: 'warning',
    property: 'color',
    selector: '.x',
    source: { file: expect.stringMatching(/layers\.css$/), line: 2 },
    related: { file: expect.stringMatching(/layers\.css$/), line: 1 },
  })
  expect(warning.node!.source!.start!.line).toBe(2)
  try {
    await compile(css, 'error')
    expect.fail('A strict conflict must fail')
  }
  catch (error) {
    expect(error).toBeInstanceOf(CssSyntaxError)
    expect(error).toMatchObject({ code: 'LAYER_SPECIFICITY', plugin: 'weapp-pandacss-ordered-layers', line: 2, cause: expect.any(CascadeLayerError) })
    expect((error as { diagnostic: CascadeLayerDiagnostic }).diagnostic).toMatchObject({ severity: 'error', source: { line: 2 } })
  }
})

it('selects the fatal diagnostic and source after an earlier warning without losing context', async () => {
  const css = '@media (width:1px){@layer a{.x{color:red}}}\n@layer b{\ncolor:blue\n}'
  try {
    await compile(css)
    expect.fail('Invalid layer input must fail after its conditional-order warning')
  }
  catch (error) {
    expect(error).toBeInstanceOf(CssSyntaxError)
    const failure = error as CssSyntaxError & { code: string, diagnostic: CascadeLayerDiagnostic, diagnostics: CascadeLayerDiagnostic[], cause: CascadeLayerError }
    expect(failure).toMatchObject({
      code: 'LAYER_NESTING',
      file: expect.stringMatching(/layers\.css$/),
      line: 3,
      column: 1,
      diagnostic: { code: 'LAYER_NESTING', severity: 'error', source: { line: 3, column: 1 } },
      diagnostics: [
        { code: 'LAYER_CONDITIONAL_ORDER', severity: 'warning', source: { line: 1 } },
        { code: 'LAYER_NESTING', severity: 'error', source: { line: 3, column: 1 } },
      ],
      cause: expect.any(CascadeLayerError),
    })
    expect(failure.diagnostic).toBe(failure.diagnostics[1])
    expect(failure.diagnostics).toBe(failure.cause.diagnostics)
    expect(failure.reason).toContain('[WP_LAYER_CONDITIONAL_ORDER]')
    expect(failure.reason).toContain('[LAYER_NESTING]')
  }
})

it.each(['@import "remaining.css";', '@layer a,b; @layer a{#id .x{color:red}} @layer b{.x{color:blue}}'])('leaves independent layer input AST intact on failure: %s', async (css) => {
  const root = postcss.parse(css, { from: 'unchanged.css' })
  const nodes: postcss.Node[] = []
  root.walk((node) => {
    nodes.push(node)
  })
  const parents = nodes.map(node => node.parent)
  await expect(postcss([orderedLayersPlugin('error')]).process(root, { from: undefined })).rejects.toBeInstanceOf(CssSyntaxError)
  const after: postcss.Node[] = []
  root.walk((node) => {
    after.push(node)
  })
  expect(root.toString()).toBe(css)
  expect(after).toHaveLength(nodes.length)
  after.forEach((node, index) => {
    expect(node).toBe(nodes[index])
    expect(node.parent).toBe(parents[index])
  })
})

it('does not invent upstream source positions for manually created nodes', async () => {
  const createRoot = () => {
    const root = postcss.parse('@layer a,b; @layer a{#id .x{color:red}} @layer b{.x{color:blue}}')
    delete root.source
    root.walk((node) => {
      delete node.source
    })
    return root
  }
  const result = await postcss([orderedLayersPlugin('warning')]).process(createRoot(), { from: undefined })
  const diagnostic = (result.warnings()[0]! as postcss.Warning & { diagnostic: CascadeLayerDiagnostic }).diagnostic
  expect(diagnostic.source).toEqual({ file: undefined, line: undefined, column: undefined })
  await expect(postcss([orderedLayersPlugin('error')]).process(createRoot(), { from: undefined })).rejects.toMatchObject({
    code: 'LAYER_SPECIFICITY',
    diagnostic: { source: { file: undefined, line: undefined, column: undefined } },
  })
})

it('delegates malformed selector diagnostics to the shared compiler', async () => {
  const root = postcss.root({ nodes: [postcss.rule({ selector: '.x[', nodes: [] })] })
  await expect(postcss([orderedLayersPlugin('warning')]).process(root, { from: undefined })).rejects.toMatchObject({ code: 'LAYER_SELECTOR_UNKNOWN' })
})

it('does not mistake authored negation for Panda placeholders', async () => {
  const css = '@layer a{.x:not(#real){color:red}.x:not(.a,.b){background:blue}.x:not([data-x]){padding:0}.x:hover{margin:0}}'
  expect((await compile(css)).css).toContain('.x:not(#real)')
})

it('preserves unexpected upstream failures rather than masking them as CSS diagnostics', async () => {
  const root = postcss.parse('@layer a{.x{color:red}}')
  const failure = new Error('custom AST traversal failed')
  vi.spyOn(root, 'walkAtRules').mockImplementation(() => {
    throw failure
  })
  await expect(postcss([orderedLayersPlugin('warning')]).process(root, { from: undefined })).rejects.toBe(failure)
})

it('reports invalid runtime layer options against the root without losing the cause', async () => {
  await expect(postcss([orderedLayersPlugin('invalid' as 'warning')]).process('.x{}', { from: 'options.css' })).rejects.toMatchObject({
    code: 'LAYER_OPTIONS',
    cause: expect.any(CascadeLayerError),
    file: expect.stringMatching(/options\.css$/),
  })
})

it('reports cross-layer descriptor identity conflicts and retains each descriptor once', async () => {
  const css = '@layer a,b; @layer a{@keyframes spin{to{opacity:1}}} @layer b{@keyframes spin{to{opacity:0}}}'
  const result = await compile(css)
  expect(result.warnings().some(warning => warning.text.includes('LAYER_DESCRIPTOR_ORDER'))).toBe(true)
  expect(result.css.match(/@keyframes spin/g)).toHaveLength(2)
  await expect(compile(css, 'error')).rejects.toThrow('LAYER_DESCRIPTOR_ORDER')
})
