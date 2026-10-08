import postcss from 'postcss'
import plugin from '@/postcss'
import { encodeClassList, encodeClassName } from '@/runtime'

describe('portable naming', () => {
  it('preserves ordinary identifiers and encodes each class independently', () => {
    expect(encodeClassName('custom-tabs__scroll')).toBe('custom-tabs__scroll')
    expect(encodeClassName('c_red.500')).toBe('c_red_wp_2e_500')
    expect(encodeClassList('2xl  -1 中文\nhover:c_red!')).toBe('_wp_32_xl _wp_2d_1 _wp_4e2d__wp_6587_ hover_wp_3a_c_red_wp_21_')
  })

  it('does not collide with literal encodings or the legacy replacement alphabet', () => {
    const values = ['a.b', 'a_db', 'a_wp_2e_b', '中文', 'u_x4e2d_', '1', '_wp_31_', '-1', '_wp_2d_1', '/', '_wp_2f_', '💡']
    const names = values.map(encodeClassName)
    expect(new Set(names).size).toBe(values.length)
    names.forEach(name => expect(name).toMatch(/^[A-Z_][\w-]*$/i))
    expect(encodeClassName('a_wp_2e_b')).toBe('a_wp_5f_wp_2e_b')
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
    await expect(postcss([plugin({ naming: 'legacy' })]).process(result.css, { from: undefined })).rejects.toThrow('Cannot mix portable and legacy')
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
