# weapp-pandacss

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

```ts
import { encodeClassList, encodeClassName } from 'weapp-pandacss/runtime'

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

| 选项                                | 默认值             | 行为                                            |
| ----------------------------------- | ------------------ | ----------------------------------------------- |
| `target`                            | `weapp`            | `weapp` 转换平台 CSS；`web` 保留 Web 选择器语义 |
| `naming`                            | `portable`         | `legacy` 仅配合弃用的文件补丁 CLI/API           |
| `disabled`                          | `false`            | 禁用所有 adapter 子插件，包括 class 编码        |
| `removeNegationPseudoClass`         | `true`             | 小程序移除 layer 插件生成的 `:not(#\#)`         |
| `selectorReplacement.root`          | `page`             | 小程序的 `:root` / `:host` 替换                 |
| `selectorReplacement.universal`     | `['view', 'text']` | 小程序的 `*` 替换                               |
| `selectorReplacement.cascadeLayers` | `n`                | 保留 layer 否定选择器时的占位 tag               |

`cascadeLayersPluginOptions` 和 `isPseudoClassPluginOptions` 分别透传给内部
csstools 插件。所有选项直接传给 PostCSS adapter，不再自动读取
`weapp-pandacss.config.ts`。业务自定义 `:not(...)` 继续保留。

## 兼容与迁移

本版本验收基线仅为 Panda CSS 2.1.2；支持 `.js` 与 `.mjs`，不支持仅 TypeScript
runtime。缺少 runtime、结构变更或不支持的版本会抛出诊断。适配器使用现有 Panda
接口，不修改上游或维护 fork。绕过 runtime、直接内联原始 class 的 Panda 源码
优化流程暂不支持。

原根 API、`weapp-panda` / `weapp-pandacss` 两个 CLI 名称保留为弃用的 legacy
入口。新产物拒绝 legacy 补丁和 rollback。升级需要清理旧生成目录和备份，然后
注册插件、重新 codegen；详见 [2.0 迁移指南](../../docs/panda-plugin-migration.md)。

## 示例

- [Taro React](../../examples/taro-app)
- [Taro Vue](../../examples/taro-app-vue3)
- [Uni-app Vue](../../examples/uni-app-vue3)
- [React Web](../../examples/react-app)
- [Weapp Vite + Wevu](../../examples/weapp-vite-app/README.md)：Vue SFC、响应式 class
  切换和真实 WXML/WXSS 产物测试；全新安装先运行 `wv prepare`。

问题反馈：[GitHub Issues](https://github.com/weapp-pandacss/weapp-pandacss/issues)。
