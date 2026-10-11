# Cascade layers

## Cascade layer 顺序兼容

小程序默认使用 `cascadeLayers: { mode: 'ordered', onConflict: 'warning' }`。Ordered 由适配层调用固定的 `@weapp-tailwindcss/css-compat@0.1.1` 内核，应用无需直接导入该包。编译器按首次声明注册层，展开嵌套、匿名及重复层，输出普通选择器，不生成 `:not(n)` 权重占位。普通声明按层顺序输出，未分层声明最后；重要声明按层逆序输出，未分层重要声明最先。同层内保留原始顺序。

这是**顺序兼容**，并非完整的原生 layer polyfill。在 WXSS 中，低优先层的高权重选择器仍可能覆盖高优先层。适配器通过 PostCSS 警告给出潜在冲突，包含层名、选择器、属性和源码位置。简写、逻辑属性和未知函数选择器采用保守检查；警告不代表两个选择器一定会命中同一元素。设置 `onConflict: 'error'` 可将诊断变为构建失败。

```js
export default {
  plugins: {
    'postcss-import': {},
    '@pandacss/dev/postcss': {},
    'weapp-pandacss/postcss': {
      cascadeLayers: { mode: 'ordered', onConflict: 'error' },
    },
  },
}
```

在 `@media` / `@supports` 等条件块使用 layer 前，先在条件外声明完整层顺序。源码可以普通 `@import`，也可带 layer；adapter 前必须完整展开导入图和 CSS nesting。**Ordered 编译拒绝所有残留 `@import`**，包括普通和远程导入，即使当前文件没有 layer：未读到的导入规则仍可能改变层顺序或未分层优先级。`postcss-import` 会保留远程导入，应将样式放到本地，或使用能提前展开它们的解析器。不要删除 import 来绕过校验。`revert-layer`、未展开的预处理语法、非法 layer 结构及已丢失层信息的 polyfill 占位也会失败。保持 Panda `polyfill: false`，从带 layer 的原始 CSS 重新生成。Web/H5（`target: 'web'`）始终保留原生 layer。

现有 `WP_LAYER_SPECIFICITY`、`WP_LAYER_CONDITIONAL_ORDER`、`WP_LAYER_SELECTOR_UNKNOWN` 文本前缀继续兼容。结构化 PostCSS warning 使用内核的 `LAYER_*` code，附完整诊断及源码位置；严格模式抛出附 diagnostics 与 cause 的 PostCSS `CssSyntaxError`。Descriptor 顺序和未知 wrapper 语义可产生新增兼容警告，`onConflict: 'error'` 会将其提升为错误。Legacy 继续使用现有 csstools 流水线，不调用共享包的 `/legacy`。公开选项、runtime 与 class 编码不变，诊断处理详见 [PostCSS API](https://panda.weapp.dev/zh/api/postcss-plugin/)。

排序只覆盖单个 PostCSS root。需要跨文件层顺序时，先合并输入，再执行适配；分别编译的文件及隔离组件样式不共享全局层注册表。Wevu 示例使用应用级 WXSS，并显式将组件 `styleIsolation` 设置为 `apply-shared`。

2.x 旧参数继续支持：显式传入 `removeNegationPseudoClass`、`selectorReplacement.cascadeLayers` 或 `cascadeLayersPluginOptions` 会选择 legacy 路径，也可配置 `cascadeLayers: { mode: 'legacy' }`。legacy 同样不保证完整原生层语义。显式 `mode: 'ordered'` 与旧参数混用时报配置错误。业务手写的 `:not(...)` 保留。

`isPseudoClassPluginOptions` 继续配置 csstools 的 `:is()` 转换。本次迁移不改变 runtime 或 class 编码。

English documentation: https://panda.weapp.dev/postcss/
