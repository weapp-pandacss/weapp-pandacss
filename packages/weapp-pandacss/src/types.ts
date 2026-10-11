// Inline type imports preserve ESM resolution in both .d.ts and .d.cts bundles.
type CascadeLayersPluginOptions = import('@csstools/postcss-cascade-layers', { with: { 'resolution-mode': 'import' } }).pluginOptions
type IsPseudoClassPluginOptions = import('@csstools/postcss-is-pseudo-class', { with: { 'resolution-mode': 'import' } }).pluginOptions

/** Options forwarded to postcss-import, including its v17 empty-file switch. */
export type PostcssImportOptions = import('postcss-import').AtImportOptions & {
  warnOnEmpty?: boolean
}

/** Options accepted by the supported official Panda PostCSS plugin. */
export type PandaPostcssOptions = NonNullable<Parameters<typeof import('@pandacss/dev/postcss', { with: { 'resolution-mode': 'import' } }).default>[0]>

/**
 * @description 核心插件 `weapp-pandacss/postcss` 的配置项
 */
export interface IPostcssPluginOptions {
  /** Expand CSS imports before Panda generation. Defaults to true. */
  imports?: boolean | PostcssImportOptions
  /** Generate styles using the official Panda plugin. Defaults to true. */
  panda?: boolean | PandaPostcssOptions
  /** Encode class names and adapt selectors/layers. Defaults to true. */
  adapter?: boolean
  /** CSS target; both targets use the same portable class names. */
  target?: 'weapp' | 'web'
  /** Ordered layer compatibility for WXSS; Web always retains native layers. */
  cascadeLayers?: {
    mode?: 'ordered' | 'legacy'
    /** Potential specificity/conditional-order differences: warn by default. */
    onConflict?: 'warning' | 'error'
  }
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
