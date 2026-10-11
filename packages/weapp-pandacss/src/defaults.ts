import type { IPostcssPluginOptions } from '@/types'
// 有数组的情况会合并
export function getPostcssPluginDefaults(): Required<IPostcssPluginOptions> {
  return {
    imports: true,
    panda: true,
    adapter: true,
    units: false,
    target: 'weapp',
    cascadeLayers: { mode: 'ordered', onConflict: 'warning' },
    selectorReplacement: {
      cascadeLayers: 'n',
      root: 'page',
      universal: ['view', 'text'], // 'view,text'
    },
    removeNegationPseudoClass: true,
    disabled: false,
    cascadeLayersPluginOptions: {},
    isPseudoClassPluginOptions: {},
  }
}
