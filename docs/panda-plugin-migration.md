# 2.0：迁移到 Panda 生成期插件

2.0 改变 class 编码和默认变量命名。runtime 和 CSS 必须一起重新生成；旧页面
产物不能与新 CSS 混用。版本由 major changeset 和发布流程确定。

## 升级步骤

1. 停止运行中的构建/watch，删除项目自己的旧 `styled-system` 目录（包括
   `_helpers.backup.js` / `.mjs` 和 `weapp-panda` 备份/补丁文件）。不要用 rollback
   恢复旧产物再接入新插件。
2. 固定 `@pandacss/dev`、`@pandacss/preset-base`、`@pandacss/preset-panda` 到
   `2.1.2`。在 Panda 配置注册 `weappPanda()`，使用 `.js` 或 `.mjs`；建议
   `outExtension: 'mjs'` 和 `forceImportExtension: true`。
3. 把 `panda codegen && weapp-panda codegen` 改为 `panda codegen`。移除
   `execFileSync`、`codegen:done` 适配 hook 和跨平台 rollback。
4. 小程序 PostCSS 注册 Panda → adapter（`target: 'weapp'`）→ rem/rpx；H5
   同样保留 adapter，使用 `target: 'web'`。把旧 adapter 配置文件里的 CSS
   选项直接移到 PostCSS 插件参数；PostCSS 不再读取该配置或修改 JS 文件。
5. 将 `styled-system/weapp-panda/index.mjs` 的手写 class 转义导入改为
   `weapp-pandacss/runtime` 的 `encodeClassName` / `encodeClassList`。仅对原始
   手写 class 编码一次；不要包装 Panda 输出或 `cx()`。
6. 重新执行 codegen 和完整构建，清理平台旧缓存；确认 runtime、CSS 和手写
   class 同时使用新编码。并行平台配置独立生成目录与 bundler alias。

Taro 默认小程序输出位于 `dist/weapp`，开发者工具使用更新后的
`project.config.json`。生成目录按平台命名：Taro 默认 `styled-system/weapp`，Uni-app 默认
`styled-system/mp-weixin`，H5 均使用 `styled-system/h5`。平台缓存仅保存当前
目标目录，避免恢复缓存时覆盖另一目标。

## 命名契约

`a.b` → `a_wp_2e_b`，原始 `a_wp_2e_b` → `a_wp_5f_wp_2e_b`；因此这两种
输入不会碰撞。Unicode 使用完整码点，class 列表逐项编码。函数不幂等，生成
产物用标记识别重复处理。CSS 的 `/*! weapp-pandacss:portable-v1 */` 标记也跨
parse/serialize 保留；不要把已经编码的 CSS 混入未编码的源码再整体转换。

Panda 原生 `hash.cssVar` 强制启用；`hash.className` 保留用户设置。字符串
prefix 的普通 class 前缀保留，变量前缀规范化；对象 prefix 的两项独立处理。
数字/连字符开头或包含保留标记的配置 class prefix、recipe className 先规范化，
再参加最终编码，以避开 Panda 2.1.2 的数字 CSS 转义歧义。
小程序手写变量采用 ASCII 名称，adapter 遇到不支持的名称会报错。
`token()`、`token.var()`、负值和语义 token 继续通过 Panda 原生实现统一生成。

## 兼容矩阵与范围

| 流程                                                    | 支持情况                                    |
| ------------------------------------------------------- | ------------------------------------------- |
| Panda 2.1.2 codegen / PostCSS 自动生成                  | 支持，同步转换 artifacts，由 Panda 写入     |
| runtime `.js` / `.mjs`                                  | 支持；TS-only 或未知结构报错                |
| `css` / `cva` / `sva` / named、slot recipes / compounds | runtime 与 selector 统一编码                |
| patterns / styled / `cx`                                | 支持；`cx` 保持拼接语义                     |
| H5 与小程序共享命名                                     | 支持，PostCSS 使用不同 target               |
| 同时写同一个 outdir                                     | 不支持，使用独立目录                        |
| 原始 class 源码内联优化                                 | 暂不支持，必须经过生成 runtime              |
| Panda 0.x 或其他 2.x                                    | 不在本版验收范围                            |
| 包入口 ESM / CJS                                        | 支持，包括 `/panda`、`/runtime`、`/postcss` |

插件仍使用受控 AST 改写生成内容，依赖已验证的 Panda 2.1.2 结构。它不执行
适配子进程、不重新加载 Panda 配置、不自行覆盖 helper、不创建 backup。

## 显式 legacy 路线

短期无法迁移的项目可以继续使用弃用的根 API 和两个 CLI 名称，在单独生成
目录中运行旧 `panda codegen && weapp-panda codegen`，PostCSS 必须显式配置
`{ naming: 'legacy', target: 'weapp' }`。不注册 `weappPanda()`；旧
`escapePredicate` 与 adapter 配置只属于 legacy API/CLI。新插件产物会拒绝
legacy codegen/rollback，portable 与 legacy CSS 不能混用。

Uni-app 示例保留 Tailwind 对比功能。`tailwind.css` 由 weapp-tailwindcss 处理，
Panda 与手写 CSS 走 portable adapter；两个入口分开，避免不同 class 编码混用。
Tailwind generator 的 `cssEntries` 显式指向 `tailwind.css`，不再重复注册官方
Tailwind PostCSS generator。`panda.css` 通过 Vite 虚拟入口先执行 Panda PostCSS，
保留 Panda 的 layer 声明生成结果，再进入 adapter → rem/rpx。这样避免 Tailwind
loader 提前移除仅含 layer 顺序声明的输入；生成依赖加入 Vite watch。

legacy H5 仍需按旧方案处理其 runtime，不能通过 `target: 'web'` 获得新契约。
新项目和五个活跃示例统一使用生成期插件。
