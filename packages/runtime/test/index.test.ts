import { runInNewContext } from 'node:vm'
import { createPortableRuntime, encodeClassList, encodeClassName } from '@/index'

describe('portable class encoding', () => {
  it('round-trips every ASCII character, Unicode blocks and astral symbols without collisions', () => {
    const inputs = new Set(['', '_wp_', '_wp_31_', '_wp_5f_wp_31_', 'a.b', 'a_wp_2e_b'])
    for (let point = 0; point < 128; point++) {
      const char = String.fromCodePoint(point)
      inputs.add(char)
      inputs.add(`a${char}b`)
      inputs.add(`${char}_wp_${char}`)
    }
    // Deterministic samples span all Unicode planes, including surrogate code
    // units: JS strings can contain those even though Unicode scalars cannot.
    for (let point = 128; point <= 0x10FFFF; point += 997) {
      inputs.add(`${String.fromCodePoint(point)}/_wp_${point}`)
    }
    const outputs = [...inputs].map(encodeClassName)
    expect(new Set(outputs).size).toBe(inputs.size)
    for (const [index, input] of [...inputs].entries()) {
      const output = outputs[index]!
      if (output) {
        expect(output).toMatch(/^[A-Z_][\w-]*$/i)
      }
      const decoded = output.replace(/_wp_([0-9a-f]+)_/g, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
      expect(decoded).toBe(input)
    }
  })

  it('uses whitespace only as a list boundary and keeps invisible non-whitespace characters in names', () => {
    const separators = [' ', '\t', '\r\n', '\v', '\f', '\u00A0', '\u2028', '\u2029', '\uFEFF']
    for (const separator of separators) {
      expect(encodeClassList(`${separator}a.b${separator}中文${separator}`)).toBe('a_wp_2e_b _wp_4e2d__wp_6587_')
    }
    expect(encodeClassList('a\u200Bb')).toBe('a_wp_200b_b')
    expect(encodeClassName(encodeClassName('a.b'))).not.toBe(encodeClassName('a.b'))
  })

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
