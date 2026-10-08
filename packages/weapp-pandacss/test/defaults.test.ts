import { getPostcssPluginDefaults } from '@/defaults'

describe('defaults', () => {
  it('getPostcssPluginDefaults', () => {
    const { selectorReplacement, removeNegationPseudoClass }
      = getPostcssPluginDefaults()
    expect(selectorReplacement).toBeDefined()
    expect(selectorReplacement.cascadeLayers).toBeDefined()
    expect(selectorReplacement.root).toBeDefined()
    expect(selectorReplacement.universal).toBeDefined()
    expect(removeNegationPseudoClass).toBe(true)
  })
})
