# Cascade layers

## Cascade layer 顺序兼容

小程序默认使用 `cascadeLayers: { mode: 'ordered', onConflict: 'warning' }`。编译器按首次声明注册层，展开嵌套、匿名及重复层，输出普通选择器，不生成 `:not(n)` 权重占位。普通声明按层顺序输出，未分层声明最后；重要声明按层逆序输出，未分层重要声明最先。同层内保留原始顺序。

这是**顺序兼容**，并非完整的原生 layer polyfill。在 WXSS 中，低优先层的高权重选择器仍可能覆盖高优先层。适配器通过 PostCSS 警告给出潜在冲突，包含层名、选择器、属性和源码位置。简写、逻辑属性和未知函数选择器采用保守检查；警告不代表两个选择器一定会命中同一元素。设置 `onConflict: 'error'` 可将诊断变为构建失败。

```js
export default {
  plugins: {
    '@pandacss/dev/postcss': {},
    'weapp-pandacss/postcss': {
      cascadeLayers: { mode: 'ordered', onConflict: 'error' },
    },
  },
}
```

在 `@media` / `@supports` 等条件块使用 layer 前，先在条件外声明完整层顺序。导入和 CSS nesting 应先由前序插件展开。未展开的 `@import … layer(...)`、`revert-layer`、CSS nesting 和已经丢失层信息的 polyfill 占位产物会明确报错。保持 Panda `polyfill: false`，从带 layer 的原始 CSS 重新生成。Web/H5（`target: 'web'`）始终保留原生 layer。

排序只覆盖单个 PostCSS root。需要跨文件层顺序时，先合并输入，再执行适配；分别编译的文件及隔离组件样式不共享全局层注册表。Wevu 示例使用应用级 WXSS，并显式将组件 `styleIsolation` 设置为 `apply-shared`。

2.x 旧参数继续支持：显式传入 `removeNegationPseudoClass`、`selectorReplacement.cascadeLayers` 或 `cascadeLayersPluginOptions` 会选择 legacy 路径，也可配置 `cascadeLayers: { mode: 'legacy' }`。legacy 同样不保证完整原生层语义。显式 `mode: 'ordered'` 与旧参数混用时报配置错误。业务手写的 `:not(...)` 保留。

`isPseudoClassPluginOptions` 继续配置 csstools 的 `:is()` 转换。本次迁移不改变 runtime 或 class 编码。

English documentation: https://panda.weapp.dev/postcss/
