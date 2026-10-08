// Inline type imports preserve ESM resolution in both .d.ts and .d.cts bundles.
type CascadeLayersPluginOptions = import('@csstools/postcss-cascade-layers', { with: { 'resolution-mode': 'import' } }).pluginOptions
type IsPseudoClassPluginOptions = import('@csstools/postcss-is-pseudo-class', { with: { 'resolution-mode': 'import' } }).pluginOptions

export type PandacssConfigFileOptions = import('@pandacss/config', { with: { 'resolution-mode': 'import' } }).LoadConfigOptions

export interface ICreateContextOptions {
  /**
   * @description 转义断言函数
   */
  escapePredicate?: string // ((className: string) => boolean) |
  pandaConfig?: Partial<PandacssConfigFileOptions>
  log?: boolean
}

/**
 * @description 核心插件 `weapp-pandacss/postcss` 的配置项
 */
export interface IPostcssPluginOptions {
  /** CSS target; both targets use the same portable class names. */
  target?: 'weapp' | 'web'
  /** Use legacy only with the deprecated file-patching CLI/API. */
  naming?: 'portable' | 'legacy'
  /**
   * @description 是否禁用
   * @default false
   */
  disabled?: boolean
  /**
   * @description 选择器转义替换字符
   */
  selectorReplacement?: {
    /**
     * @description `:not(#\#)` 的转义方案
     * 默认是 `:not(#\#)` -> `:not(n)`
     * @default 'n'
     */
    cascadeLayers?: string
    /**
     * @description `*` 的转义方案
     * 默认是 `*` 展开 -> `view,text`
     * @default `['view', 'text']`
     */
    universal?: string | string[]
    /**
     * @description `:root` 的转义方案
     * 默认是 `:root` -> `page`
     * @default 'page'
     */
    root?: string | string[]
  }
  /**
   * @description 是否去除所有的 `:not(#\#)` 选择器
   * @default true
   */
  removeNegationPseudoClass?: boolean

  /**
   * @description CascadeLayersPluginOptions
   */
  cascadeLayersPluginOptions?: CascadeLayersPluginOptions

  /**
   * @description IsPseudoClassPluginOptions
   */
  isPseudoClassPluginOptions?: IsPseudoClassPluginOptions
}

/**
 * @description 用户在 `weapp-pandacss.config.ts` 文件里定义的配置
 */
export interface UserConfig {
  /**
   * @description postcss 配置
   */
  postcss?: Pick<
    IPostcssPluginOptions,
    'selectorReplacement' | 'removeNegationPseudoClass' | 'disabled' | 'target' | 'naming'
  >

  /**
   * @description 代码生成器上下文配置
   */
  context?: Pick<ICreateContextOptions, 'escapePredicate' | 'pandaConfig'>
}
