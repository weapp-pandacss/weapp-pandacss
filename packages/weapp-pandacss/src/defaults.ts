import type { IPostcssPluginOptions } from '@/types'
// 有数组的情况会合并
export function getPostcssPluginDefaults(): Required<IPostcssPluginOptions> {
  return {
    target: 'weapp',
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
