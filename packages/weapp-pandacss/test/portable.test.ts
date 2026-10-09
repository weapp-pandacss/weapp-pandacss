import * as standalone from '@weapp-pandacss/runtime'
import postcss from 'postcss'
import plugin from '@/postcss'
import { createPortableRuntime, encodeClassList, encodeClassName } from '@/runtime'

describe('portable naming', () => {
  it('re-exports the standalone implementation through the compatibility entry', () => {
    expect(encodeClassName).toBe(standalone.encodeClassName)
    expect(encodeClassList).toBe(standalone.encodeClassList)
    expect(createPortableRuntime).toBe(standalone.createPortableRuntime)
  })

  it('uses the same names in both targets without changing Web selectors', async () => {
    const source = '@layer utilities { :where(:root) { --abc: red } .hover\\:c_red\\.500:hover { color: var(--abc) } }'
    const web = (await postcss([plugin({ target: 'web' })]).process(source, { from: undefined })).css
    const weapp = (await postcss([plugin()]).process(source, { from: undefined })).css
    const name = encodeClassName('hover:c_red.500')
    expect(web).toContain(`.${name}:hover`)
    expect(weapp).toContain(`.${name}:hover`)
    expect(web).toContain('@layer')
    expect(web).toContain(':where(:root)')
    expect(weapp).not.toContain('@layer')
    expect(weapp).toContain('page')
    expect(weapp).toContain('var(--abc)')
  })

  it('does not encode a stylesheet twice within the same PostCSS pipeline', async () => {
    const result = await postcss([plugin({ target: 'web' }), plugin({ target: 'web' })])
      .process('.a\\.b {} .a_wp_2e_b {}', { from: undefined })
    expect(result.css).toContain('.a_wp_2e_b {} .a_wp_5f_wp_2e_b {}')
    expect((await postcss([plugin({ target: 'web' })]).process(result.css, { from: undefined })).css).toBe(result.css)
  })

  it('fully disables all CSS transformations', async () => {
    const source = '@layer x { :where(:root) { --a\\.b: red } .a\\.b {} }'
    expect((await postcss([plugin({ disabled: true })]).process(source, { from: undefined })).css).toBe(source)
  })

  it('validates mini-program variables when converting an already named Web stylesheet', async () => {
    const web = await postcss([plugin({ target: 'web' })]).process('.a { --中文: red }', { from: undefined })
    await expect(postcss([plugin()]).process(web.css, { from: undefined })).rejects.toThrow('Unsupported mini-program CSS variable')
  })

  it.each([
    '.a { --a\\.b: red }',
    '.a { color: var(--a\\.b) }',
    '.a { color: var(--safe, var(--中文)) }',
    '@property --a\\.b { syntax: "<color>"; }',
  ])('rejects unsupported variable identifiers: %s', async (source) => {
    await expect(postcss([plugin()]).process(source, { from: undefined })).rejects.toThrow('Unsupported mini-program CSS variable')
  })

  it('does not mistake quoted text or URLs for variable references', async () => {
    const source = '.a { content: "var(--a.b)"; background: url("var(--中文)"); }'
    expect((await postcss([plugin()]).process(source, { from: undefined })).css).toContain(source)
  })
})
