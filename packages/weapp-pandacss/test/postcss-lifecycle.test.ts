import postcss from 'postcss'
import plugin from '@/postcss'
import { innerPlugin, useOptions } from '@/postcss/plugins'

it('disables inner transformation before PostCSS prepares its visitors', async () => {
  const { optionsRef } = useOptions({ disabled: true })
  const input = ':root, * { color: red }'
  expect((await postcss([innerPlugin(optionsRef)]).process(input, { from: undefined })).css).toBe(input)
})

it('honors option changes after prepare in both Rule and OnceExit visitors', async () => {
  const { optionsRef, mergeOptions } = useOptions()
  const input = ':root, .a:not(#\\#) { color: red }'
  const result = await postcss([
    { postcssPlugin: 'disable-after-prepare', Once() { mergeOptions({ disabled: true }) } },
    innerPlugin(optionsRef),
  ]).process(input, { from: undefined })
  expect(result.css).toBe(input)
})

it('does not interpret empty or comment-only var() arguments as variable identifiers', async () => {
  const input = '.a { color: var(); background: var(/* comment */); --safe: 1; }'
  expect((await postcss([plugin()]).process(input, { from: undefined })).css).toContain(input)
})

it('reports invalid selector syntax instead of silently emitting unencoded CSS', async () => {
  await expect(postcss([plugin()]).process('.a:not( { color: red }', { from: undefined })).rejects.toThrow()
})

it.each([
  ['.container * > text {}', '.container view>text,.container text>text'],
  ['.container :where(.a, .b) > text {}', '.container .a>text,.container .b>text'],
  ['.container :root > text {}', '.container page>text'],
  ['* + * {}', 'view+view,view+text,text+view,text+text'],
  [':where(:root, :host) {}', 'page'],
  [':where(.a, .b) :where(.c, .d) {}', '.a .c,.a .d,.b .c,.b .d'],
  ['.a:not(:where(.b, .c)) {}', '.a:not(.b,.c)'],
  ['.a:has(~ *) {}', '.a:has(~view,~text)'],
  ['* ~ * {}', 'view+view,view+text,text+view,text+text'],
  ['.a :where(:root) {}', '.a page'],
])('preserves selector context while expanding %s', async (input, expected) => {
  const result = await postcss([plugin()]).process(input, { from: undefined })
  const selectors: string[] = []
  result.root.walkRules((rule) => {
    selectors.push(rule.selector)
  })
  expect(selectors).toEqual([expected])
})

it('expands configured root arrays without merging tags or losing selector context', async () => {
  const result = await postcss([plugin({ selectorReplacement: { root: ['page', 'body'] } })])
    .process('.a :root > text, .b :where(:root, :host) {}', { from: undefined })
  expect(result.root.first?.type).toBe('comment')
  const selectors: string[] = []
  result.root.walkRules((rule) => {
    selectors.push(rule.selector)
  })
  expect(selectors).toEqual(['.a page>text,.a body>text,.b page,.b body'])
})
