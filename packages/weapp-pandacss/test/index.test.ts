import { encodeClassList, encodeClassName, postcssPlugin, weappPanda } from '@/index'

describe('[Default]', () => {
  it('export default', () => {
    for (const x of [encodeClassList, encodeClassName, postcssPlugin, weappPanda]) {
      expect(x).toBeDefined()
    }
  })
})
