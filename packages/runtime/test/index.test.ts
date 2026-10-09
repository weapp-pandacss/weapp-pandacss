import { runInNewContext } from 'node:vm'
import { createPortableRuntime, encodeClassList, encodeClassName } from '@/index'

describe('portable class encoding', () => {
  it('preserves ordinary identifiers and encodes each class independently', () => {
    expect(encodeClassName('custom-tabs__scroll')).toBe('custom-tabs__scroll')
    expect(encodeClassName('c_red.500')).toBe('c_red_wp_2e_500')
    expect(encodeClassList('2xl  -1 中文\nhover:c_red!')).toBe('_wp_32_xl _wp_2d_1 _wp_4e2d__wp_6587_ hover_wp_3a_c_red_wp_21_')
    expect(encodeClassName('')).toBe('')
    expect(encodeClassList(' \n\t ')).toBe('')
  })

  it('does not collide with literal encodings or the legacy replacement alphabet', () => {
    const values = ['a.b', 'a_db', 'a_wp_2e_b', '中文', 'u_x4e2d_', '1', '_wp_31_', '-1', '_wp_2d_1', '/', '_wp_2f_', '💡']
    const names = values.map(encodeClassName)
    expect(new Set(names).size).toBe(values.length)
    names.forEach(name => expect(name).toMatch(/^[A-Z_][\w-]*$/i))
    expect(encodeClassName('a_wp_2e_b')).toBe('a_wp_5f_wp_2e_b')
    expect(encodeClassName('💡')).toBe('_wp_1f4a1_')
  })

  it('can embed the factory into a runtime without imports or Node globals', () => {
    const embedded = runInNewContext(`(${createPortableRuntime.toString()})()`, Object.create(null)) as ReturnType<typeof createPortableRuntime>
    for (const value of ['a.b', '中文/💡', '-1', '1card', '_wp_2e_', 'padding:0.5', 'red!']) {
      expect(embedded.encodeClassName(value)).toBe(encodeClassName(value))
    }
    expect(embedded.encodeClassList('a.b 中文/💡\n-1')).toBe(encodeClassList('a.b 中文/💡\n-1'))
  })
})
