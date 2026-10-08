import { normalizeString } from '@/utils'

describe('utils', () => {
  it('normalizeString', () => {
    expect(normalizeString('1111')).toBe('1111')
    expect(normalizeString(['1111'])).toEqual('1111')
    expect(normalizeString(['123', 'abc'])).toEqual('123,abc')
    expect(normalizeString(['123', 'abc'], '')).toEqual('123abc')
  })
})
