# @weapp-pandacss/runtime

用于 Panda CSS、小程序和 Web 的独立 class 编码包。提供 ESM、CommonJS 和对应 TypeScript 声明，构建目标为 ES2018。不包含运行时依赖、peerDependencies 或 Node API；目标平台的语法转译和 polyfill 仍由应用构建工具负责。

## 安装

```bash
pnpm add @weapp-pandacss/runtime
```

```ts
import { encodeClassList, encodeClassName } from '@weapp-pandacss/runtime'

encodeClassName('custom/active') // custom_wp_2f_active
encodeClassList('custom/active 中文') // custom_wp_2f_active _wp_4e2d__wp_6587_
```

```js
const { encodeClassName } = require('@weapp-pandacss/runtime')
```

普通 ASCII 名称保持可读，特殊字符使用 `_wp_<十六进制码点>_`。原名称中的 `_wp_` 标记、前导数字和连字符也会转义；Unicode 按完整码点编码，class 列表按空白拆分。

仅对原始手写名称编码一次。编码函数本身**不幂等**，不要再次编码 Panda `css()`、recipe 返回值或已编码 class。CSS 源码保留原始名称并按普通 CSS 语法转义，再交给 `weapp-pandacss/postcss` 生成匹配的选择器。独立 runtime 包不转换 CSS，也不提供 Panda 构建集成。

## 生成期工厂

`createPortableRuntime()` 返回 `{ encodeClassName, encodeClassList }`。工厂实现自包含，Panda adapter 可以将其嵌入生成产物，无需运行时解析包导入。业务页面通常只需使用两个具名编码函数。

## 兼容性

`weapp-pandacss/runtime` 继续可用，包含工厂在内的导出均转导出同一实现。主包打包后会精确锁定 runtime 版本；发布可复用组件时应与 adapter 使用匹配版本。本次拆分不改变编码规则；未来不兼容的编码变更需要 runtime major 发布并同步调整 adapter。

文档：[简体中文](https://panda.weapp.dev/zh/runtime/) · [English](https://panda.weapp.dev/runtime/)。
