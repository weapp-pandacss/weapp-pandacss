// Inline type imports preserve ESM resolution in both .d.ts and .d.cts bundles.
type CascadeLayersPluginOptions = import('@csstools/postcss-cascade-layers', { with: { 'resolution-mode': 'import' } }).pluginOptions
type IsPseudoClassPluginOptions = import('@csstools/postcss-is-pseudo-class', { with: { 'resolution-mode': 'import' } }).pluginOptions

/** Options forwarded unchanged to the built-in rule-based unit converter. */
export type UnitConversionOptions = import('postcss-rule-unit-converter', { with: { 'resolution-mode': 'import' } }).UserDefinedOptions

export type ConversionRule = import('postcss-rule-unit-converter', { with: { 'resolution-mode': 'import' } }).ConversionRule
export type ConvertedValue = import('postcss-rule-unit-converter', { with: { 'resolution-mode': 'import' } }).ConvertedValue
export type GlobalUnitTransform = import('postcss-rule-unit-converter', { with: { 'resolution-mode': 'import' } }).GlobalUnitTransform
export type LinearPresetOptions = import('postcss-rule-unit-converter', { with: { 'resolution-mode': 'import' } }).LinearPresetOptions
export type NumericResolver = import('postcss-rule-unit-converter', { with: { 'resolution-mode': 'import' } }).NumericResolver
export type PresetFactory<TOptions extends PresetOptions = undefined> = import('postcss-rule-unit-converter', { with: { 'resolution-mode': 'import' } }).PresetFactory<TOptions>
export type PresetGroupFactory<TOptions extends PresetOptions = undefined> = import('postcss-rule-unit-converter', { with: { 'resolution-mode': 'import' } }).PresetGroupFactory<TOptions>
export type PresetOptions = import('postcss-rule-unit-converter', { with: { 'resolution-mode': 'import' } }).PresetOptions
export type PxPresetGroupOptions = import('postcss-rule-unit-converter', { with: { 'resolution-mode': 'import' } }).PxPresetGroupOptions
export type RatioOptions = import('postcss-rule-unit-converter', { with: { 'resolution-mode': 'import' } }).RatioOptions
export type RemBasedPresetOptions = import('postcss-rule-unit-converter', { with: { 'resolution-mode': 'import' } }).RemBasedPresetOptions
export type RemToViewportHeightPresetOptions = import('postcss-rule-unit-converter', { with: { 'resolution-mode': 'import' } }).RemToViewportHeightPresetOptions
export type RemToViewportPresetOptions = import('postcss-rule-unit-converter', { with: { 'resolution-mode': 'import' } }).RemToViewportPresetOptions
export type RpxPresetGroupOptions = import('postcss-rule-unit-converter', { with: { 'resolution-mode': 'import' } }).RpxPresetGroupOptions
export type RuleContext = import('postcss-rule-unit-converter', { with: { 'resolution-mode': 'import' } }).RuleContext
export type RuleGroup = import('postcss-rule-unit-converter', { with: { 'resolution-mode': 'import' } }).RuleGroup
export type RuleTransform = import('postcss-rule-unit-converter', { with: { 'resolution-mode': 'import' } }).RuleTransform
export type UnitMap = import('postcss-rule-unit-converter', { with: { 'resolution-mode': 'import' } }).UnitMap
export type UnitMapPresetOptions = import('postcss-rule-unit-converter', { with: { 'resolution-mode': 'import' } }).UnitMapPresetOptions
export type UnitMatcher = import('postcss-rule-unit-converter', { with: { 'resolution-mode': 'import' } }).UnitMatcher
export type UnitRule = import('postcss-rule-unit-converter', { with: { 'resolution-mode': 'import' } }).UnitRule
export type UnitTransform = import('postcss-rule-unit-converter', { with: { 'resolution-mode': 'import' } }).UnitTransform
export type ViewportGroupOptions = import('postcss-rule-unit-converter', { with: { 'resolution-mode': 'import' } }).ViewportGroupOptions
export type ViewportHeightPresetOptions = import('postcss-rule-unit-converter', { with: { 'resolution-mode': 'import' } }).ViewportHeightPresetOptions
export type ViewportPresetOptions = import('postcss-rule-unit-converter', { with: { 'resolution-mode': 'import' } }).ViewportPresetOptions

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
  /** Convert length units after adaptation. Defaults to false; no implicit ratio. */
  units?: false | UnitConversionOptions
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
