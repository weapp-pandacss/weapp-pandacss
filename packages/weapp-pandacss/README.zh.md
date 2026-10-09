# weapp-pandacss

文档：[简体中文](https://panda.weapp.dev/zh/) · [English](https://panda.weapp.dev/)。

在小程序和 Web 中使用 Panda CSS 2.1.2，并保持 runtime class 与 CSS selector 一致。
适配分成 Panda 生成期插件和 PostCSS 插件：前者通过受控 AST 转换生成产物，
由 Panda 负责写入；后者转换选择器和小程序平台 CSS。正常构建只执行 Panda
命令，无需适配 CLI、runtime 备份或 rollback。

## 安装

使用 Node.js 22.18+ 或 24.11+。

```bash
pnpm add -D @pandacss/dev@2.1.2 @pandacss/preset-base@2.1.2 @pandacss/preset-panda@2.1.2 weapp-pandacss postcss
```

Panda 2 的两个 preset 需要显式安装和注册。

```ts
// panda.config.ts
import { defineConfig } from '@pandacss/dev'
import { weappPanda } from 'weapp-pandacss/panda'

export default defineConfig({
  plugins: [weappPanda()],
  polyfill: false,
  presets: ['@pandacss/preset-base', '@pandacss/preset-panda'],
  include: ['./src/**/*.{js,jsx,ts,tsx,vue}'],
  preflight: false,
  outdir: 'styled-system',
  outExtension: 'mjs',
  forceImportExtension: true,
})
```

```js
// postcss.config.cjs
module.exports = {
  plugins: {
    '@pandacss/dev/postcss': {},
    'weapp-pandacss/postcss': { target: 'weapp' },
    'postcss-rem-to-responsive-pixel': {
      rootValue: 32,
      propList: ['*'],
      transformUnit: 'rpx',
    },
  },
}
```

rem/rpx 插件按需安装；顺序保持 Panda → adapter → 单位转换。
全局 CSS 注册 `@layer reset, base, tokens, recipes, utilities;`。
构建或开发启动前执行 `panda codegen`，把生成目录加入 `.gitignore`。
Panda 的 PostCSS 自动生成流程也会运行生成期插件。

```json
{
  "scripts": {
    "codegen": "panda codegen"
  }
}
```

从生成目录导入 `css`、`cva`、`sva`、patterns、recipes 和 styled，保持 Panda
原有用法。别名需要同时配置 TypeScript 与框架 bundler；参考仓库五个示例。
生成文件仍需经框架转译到目标小程序支持的 JS 语法，适配器不提供语法 polyfill。

## H5 与小程序

H5 同样注册 Panda 插件和 PostCSS adapter，把 `target` 设为 `web`。
Web 保留 `@layer`、`:where`、`:is` 和其他选择器语义；默认 `weapp` 执行平台转换。
两者共享编码，无需切换 runtime 或 rollback。

同时构建 H5 和小程序时，各进程必须使用独立 `outdir`，并把相同的逻辑导入别名
映射到对应目录。Taro 与 Uni-app 示例使用 `styled-system/<平台>`（分别默认
`weapp`、`mp-weixin`），H5 使用 `h5`，通过 `importMap: 'styled-system'` 提取源码。
不要让多个 codegen 进程写入同一个目录。

## class 与 CSS 变量

普通 ASCII class 保持可读。特殊字符编码为 `_wp_<十六进制码点>_`，例如
`c_red.500` → `c_red_wp_2e_500`。原名中的 `_wp_` 标记、前导数字、前导连字符
也会编码，避免与生成名碰撞；支持 Unicode 码点。

手写特殊 class 时使用公共、无 Node 依赖的 runtime：

```bash
pnpm add @weapp-pandacss/runtime
```

独立包不引入 Panda、PostCSS 或 Babel。原有 `weapp-pandacss/runtime` 入口继续可用，包含 `createPortableRuntime()` 在内的导出共享同一实现。

```ts
import { encodeClassList, encodeClassName } from '@weapp-pandacss/runtime'

const single = encodeClassName('custom/active')
const list = encodeClassList('custom/active 中文')
```

CSS 源码保留原始 selector，按 CSS 语法转义特殊字符，由 PostCSS 统一编码。
编码函数本身不幂等，不要再次编码 Panda `css()` / recipe 输出。`cx()` 只拼接。
JS 和 CSS 生成标记用于检测重复转换；不要移除标记后重新处理生成产物。

插件在 `config:resolved` 中启用 Panda 原生 `hash.cssVar`，并规范化特殊变量 prefix。
独立的 `hash.className` 设置保留。带前导数字/连字符或保留标记的 class prefix
和配置 recipe 名称会先规范化，避免 Panda 的数字 CSS 转义产生歧义。变量声明和 `token()` / `token.var()` 引用均由
Panda 生成，adapter 不再替换变量名。小程序中手写变量必须使用 ASCII 的
`--[A-Za-z0-9_-]+` 标识符；不支持的声明、`var()` 引用或 `@property` 会报错。

## PostCSS 配置

| 选项                                         | 默认值             | 行为                                            |
| -------------------------------------------- | ------------------ | ----------------------------------------------- |
| `target`                                     | `weapp`            | `weapp` 转换平台 CSS；`web` 保留 Web 选择器语义 |
| `disabled`                                   | `false`            | 禁用所有 adapter 子插件，包括 class 编码        |
| `cascadeLayers.mode`                         | `ordered`          | 编译层顺序；`legacy` 保留旧路径                 |
| `cascadeLayers.onConflict`                   | `warning`          | 警告潜在语义差异；`error` 阻止构建              |
| `removeNegationPseudoClass` (legacy)         | `true`             | 小程序移除 layer 插件生成的 `:not(#\#)`         |
| `selectorReplacement.root`                   | `page`             | 小程序的 `:root` / `:host` 替换                 |
| `selectorReplacement.universal`              | `['view', 'text']` | 小程序的 `*` 替换                               |
| `selectorReplacement.cascadeLayers` (legacy) | `n`                | 保留 layer 否定选择器时的占位 tag               |

`cascadeLayersPluginOptions` 仅在 legacy 路径透传给 layer 插件；
`isPseudoClassPluginOptions` 配置 `:is()` 插件。所有选项直接传给 PostCSS adapter，不再自动读取
`weapp-pandacss.config.ts`。业务自定义 `:not(...)` 继续保留。

## 兼容与迁移

本版本验收基线仅为 Panda CSS 2.1.2；支持 `.js` 与 `.mjs`，不支持仅 TypeScript
runtime。缺少 runtime、结构变更或不支持的版本会抛出诊断。适配器使用现有 Panda
接口，不修改上游或维护 fork。绕过 runtime、直接内联原始 class 的 Panda 源码
优化流程暂不支持。

v2 直接移除旧的文件补丁/配置 API、`weapp-panda` / `weapp-pandacss` 两个 CLI
和 PostCSS `naming` 选项。根入口仅导出 `weappPanda`、`postcssPlugin`、
`encodeClassName`、`encodeClassList` 及 PostCSS 配置类型；子入口均提供 ESM/CJS
和对应声明。升级需要清理旧生成目录和备份，然后注册插件、重新 codegen；
详见 [2.0 迁移指南](../../docs/panda-plugin-migration.md)。

## 示例

- [Taro React](../../examples/taro-app)
- [Taro Vue](../../examples/taro-app-vue3)
- [Uni-app Vue](../../examples/uni-app-vue3)
- [React Web](../../examples/react-app)
- [Weapp Vite + Wevu](../../examples/weapp-vite-app/README.md)：Vue SFC、响应式 class
  切换和真实 WXML/WXSS 产物测试；全新安装先运行 `wv prepare`。

问题反馈：[GitHub Issues](https://github.com/weapp-pandacss/weapp-pandacss/issues)。

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
