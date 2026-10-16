# 测试策略与验收

目标是让两包的**全部 `packages/*/src/**/*.ts` 自有源码**达到 100% 语句、分支、函数和行覆盖，并用真实生成、打包消费和页面交互验证行为。覆盖率逐文件检查，未被导入的源码也进入统计；不通过忽略标记或排除难测的库文件提高数字。框架生成代码、示例和测试脚本不属于该源码分母，分别由集成/E2E 门禁验证。100% 代码覆盖率不等于穷尽所有输入、设备和渲染行为。

## 测试分层

| 层             | 验证内容                                                                                                                                            | 入口                           |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 编码契约       | ASCII、Unicode 各平面、代理码元、前导数字/连字符、空白、保留标记、碰撞、独立解码往返                                                                | runtime Vitest                 |
| 配置与 AST     | 配置不变性、Babel ESM/CJS 互操作、版本诊断、损坏/不完整产物、重复处理、属性描述符、symbol 和 `.raw`                                                 | adapter Vitest                 |
| CSS            | Web/weapp 目标、变量校验、cascade layer、`:where`、`:not`、选择器上下文、多个替换的组合、disabled 生命周期                                          | adapter Vitest/快照            |
| 真实 Panda     | 2.1.2 / 2.2.0 的 `.js`/`.mjs`、class hash、codegen/PostCSS 自动生成与配置重载；css/cva/sva、named/slot recipe、compound、pattern、styled、cx、token | Panda 集成测试                 |
| 发布消费       | 两包 tarball、离线隔离安装、ESM/CJS、类型解析、入口函数身份、runtime 无依赖、自包含工厂                                                             | packed-runtime/entrypoints/tsd |
| 框架产物       | Taro React/Vue、Uni-app 小程序/H5 的最终 WXSS/CSS 与实际生成 runtime 类名匹配                                                                       | taro-artifacts/uni-artifacts   |
| Taro HTML 钩子 | 已安装 core 的水合及事件钩子、原生 view 的 class 恢复、优化节点别名、click→tap 绑定与移除                                                           | taro-html-hydration            |
| 小程序逻辑 E2E | 真实 Wevu 编译产物、组件注册/渲染、点击、class 更新、WXSS 匹配、独立运行时状态隔离与重启                                                            | mpcore integration             |
| 浏览器 E2E     | React **生产构建**，三引擎 computed style、hover、compound/slot 切换、重复交互、reload、窄屏、手写碰撞名、控制台错误                                | Playwright                     |
| 真实微信验收   | 真实 IDE 的 AppService、样式变化、WXSS 匹配、reLaunch 状态重置和截图                                                                                | 可选 DevTools 入口             |

适配器的 Panda 最低版本为 2.1.2，后续稳定版本不设上限。版本门禁测试覆盖低版本、无效版本、预发布版本和后续稳定版本，AST 校验继续负责拒绝不兼容的生成结构。Panda 兼容 fixture 在隔离消费者中解包适配器，分别使用锁文件固定的 2.1.2 和 2.2.0 包，全程离线；这两个版本是实际测试的 cohort，不代表穷举了整个支持范围。每个消费者解析自己的 Panda 与同版本 preset，不能通过工作区导入偷用默认的 2.2.0 安装。

小程序逻辑 E2E 使用 1.0.0 的 `@mpcore/weapp-vite` 构建真实应用，再由 `@mpcore/test` 运行 WXML。它不模拟微信 CSS 排版，也不替代真实开发者工具或手机验收。Taro/Uni 的产物测试保证输出匹配，不宣称验证了这些框架的真实点击交互。

`taro-html-hydration.test.ts` 加载已安装的 Taro 4.3.0 core hydrator、事件目标、辅助函数及 HTML 钩子。原生 `<view>` 覆盖 `pure-view`、`static-view`、`click-view`、`view` 和 `catch-view`，要求首次水合、class 更新和恢复均保留相同的 `h5-view` 前缀；另验证 NutUI 覆盖层所需 click→tap 的触发与移除，以及普通 HTML 标签映射。仅 DOM 节点和更新队列使用 fixture，HTML 标签默认值来自已安装插件的构建入口。

上游 HTML 钩子读取已经优化的水合节点名，7 项测试中有 4 项失败。`@tarojs/plugin-html@4.3.0` 的 pnpm 补丁同时修改源码与分发运行时，改为读取原始 `node.nodeName`；实际安装补丁后 7 项全部通过。保留标准 HTML 插件配置及原生 `<view>` fixture：排除 `view` 会破坏 click→tap 映射。此回归证明运行时钩子的行为；重新构建后仍须单独通过真实 IDE 的 class 恢复与 NutUI 交互验收。

## 本地与 CI

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm lint
pnpm typecheck
pnpm tsd
pnpm test
pnpm pack:check
pnpm exec repo doctor

pnpm exec playwright install chromium firefox webkit
pnpm test:e2e:web
pnpm test:e2e:weapp
# 或两种 E2E 顺序运行
pnpm test:e2e
```

`pnpm build` 包含五个活跃示例和双语文档。`pnpm test` 默认启用四项 100% 逐文件门禁，`pnpm test:coverage` 可单独生成 HTML、LCOV 和 JSON 报告到 `coverage/`。公开类型由 `pnpm tsd` 和 `test:types` 校验。

CI 保留 Windows/macOS/Linux × Node 22/24 六组完整验证，新增 Linux/Node 24 三浏览器任务。Playwright 串行、headless，使用自己创建的隔离 context 和严格端口的 preview 服务，禁止接管已有服务；runner 自动释放浏览器和服务。失败保存 trace、截图和 HTML 报告，CI 保留 14 天；重试后才成功也按 flaky 失败处理。`e2e/` 和 Playwright 配置纳入 lint/typecheck。

不要同时启动会写入相同示例输出目录的 build/watch/E2E。默认流程先构建再测试，浏览器与单元测试在独立 CI job 中运行。所有生成目录、coverage 和 E2E 报告均不提交。

## 同一提交的完整验收

`pnpm test:acceptance` 串行执行发布候选的完整门禁。先提交候选代码，并保持 tracked 工作区干净。编排器记录 commit/tree，给已有本地 `.env.test` 和 `stats/` 文件计算摘要但不修改它们，拒绝未提交源码及步骤之间的内容变化。持有 `e2e-artifacts/acceptance.lock` 时，不启动其他构建、watch 或 IDE 套件。

预先安装 Playwright 对应版本的三个浏览器，并满足下节的真实 IDE 前置条件。将 `WEAPP_ACCEPTANCE_NODE22`、`WEAPP_ACCEPTANCE_NODE24` 分别设为 Node **22.18.0**、**24.11.0** 可执行文件的绝对路径。这两个运行时验证发布包的支持下限；私有工作区仍使用更严格的开发环境 engines。消费者使用真实打包产物运行 ESM/CJS 和声明检查，包括离线 Panda 2.1.2 / 2.2.0 cohort。

文档 `deploy:check` 门禁先构建站点、运行 Wrangler 部署 dry run，再检查生成的发现入口产物。`check:deployment` 校验各路由的 `_headers`、ARD 别名与能力 URL、robots/sitemap 覆盖、UTF-8 文本导出、嵌套 LLM 目录链接和全文导出的页面覆盖，也可直接检查已有产物而不重新构建。此静态检查验证生成的响应头规则，实际 HTTP 响应头行为仍需部署/运行时验证。框架 H5 测试还要求子组件 props 在四次切换和 reload 后具有精确背景色、字号和间距，并验证 Uni-app Panda/Tailwind 的文本大小写状态。

固定顺序为 frozen install → validate → 打包检查 → repo doctor/full check → 依赖/catalog 一致性 → 安全审计比较 → 最低 Node 消费者 → Wevu → React Web → 框架 H5 → 文档示例/浏览器/部署 dry-run → 开发/watch → 重新构建小程序 → **两轮真实 IDE**。浏览器门禁使用 Chromium、Firefox、WebKit。最后四个小程序只构建一次，两轮 IDE 必须关联同一 SHA，并保持构建产物摘要一致。编排器不执行发布或部署。

每步日志与 `result.json` 写入唯一的 `e2e-artifacts/acceptance/<时间>-<sha>/`。可通过 `WEAPP_ACCEPTANCE_ARTIFACT_DIR` 选择尚不存在的绝对目录。开发/watch 套件和每轮 IDE 的执行时限均为 30 分钟，编排器分别允许 35 分钟，为取消后的清理和证据保存预留时间。完整验收运行全部四个 watch 框架，覆盖诊断用的单框架筛选，并将证据写入自己的 `dev-watch/` 目录。未登录、服务端口关闭、Node/浏览器/脚本缺失均明确失败；没有选择部分层或跳过的参数，`--help` 只说明流程。仅全部门禁和两轮独立 IDE 记录均成功（包括清理）后才记为通过。原 `pnpm test:e2e:devtools` 保留为**单轮**诊断入口。

`pnpm audit:acceptance` 将实时 registry 审计与已审阅的 [2026-10-15 基线](./dependency-review-2026-10-15.md)比较：仍有 critical 3、high 19、moderate 33、low 6。`e2e/audit-baseline.json` 保存全部 61 个 GHSA、严重度、受影响版本及各工作区到目标版本的实际锁文件依赖边。即使总数相同，新增 GHSA、受影响版本、风险升级或依赖链也会失败。Audit 自带路径列表存在截断，故依赖链使用完整工作区锁文件遍历，并正确解析原生 pnpm 的多 YAML document 格式。它是“无新增风险”的比较，并非漏洞清零；修改该基线需要单独明确审阅。

## 真实微信开发者工具

该入口显式启用，不在没有 GUI/账号的 CI 中静默跳过。运行前从 [官方稳定版下载页](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html) 核对最新稳定版，确认所选安装与实际宿主版本一致、已登录且服务端口已开启。不得因为失败而回退 RC/nightly 或其他安装。

先运行 `pnpm exec playwright install chromium`，设置以下环境变量后运行 `pnpm test:e2e:devtools`：

| 变量                                        | 含义                                                      |
| ------------------------------------------- | --------------------------------------------------------- |
| `WEAPP_VITE_E2E_DEVTOOLS_CLI_PATH`          | 所选稳定 IDE CLI 的绝对路径；预检、启动、清理使用同一路径 |
| `WEAPP_VITE_E2E_APPID`                      | 有权限的真实 AppID，拒绝 touristappid                     |
| `WEAPP_VITE_E2E_DEVTOOLS_STABLE_VERSION`    | 本轮官方渠道核对的最新稳定版本                            |
| `WEAPP_VITE_E2E_DEVTOOLS_INSTALLED_VERSION` | 本轮核对的实际 IDE 宿主版本，须与稳定版一致               |
| `WEAPP_VITE_E2E_DEVTOOLS_CHECKED_AT`        | 核对时间 ISO 字符串，须在 24 小时内                       |

版本值是操作者核对官方发行渠道的证据；连接到的 IDE 还必须通过 `Tool.getInfo.version` 返回相同的实际宿主版本，且 `Tool.getInfo.SDKVersion`、`systemInfo.SDKVersion` 均须匹配固定的正式基础库。入口先运行 `wv ide doctor`，通过 `wv auto` 为每个应用启动一次 IDE 自动化项目，应用内复用一个测试连接，通过 `reLaunch` 切换场景。每个应用复制到唯一临时目录，只在临时配置中注入 AppID、正式基础库及调试路由；仓库 AppID 配置保持不变。

Wevu 独立验收页覆盖 css/cva/sva、named/slot compound recipes、patterns、cx/合并、token 返回值/变量、语义及负值 token、important、编码碰撞、Unicode 和前导字符。导航返回必须保留响应式状态，reLaunch 则重置状态。Wevu、Taro React、Taro Vue、Uni-app 和独立原生 tarball 消费者分别执行两次 reLaunch，每次四次用户切换，检查真实 class/样式并比较恢复 neutral 后的视口像素。框架探针还检查实际节点 class 对应的最终 WXSS 声明确实引用 Panda token，并精确对照最终变量值。Uni-app 同时检查 Panda/Tailwind 的响应式 props，Taro Vue 检查 NutUI 交互，原生路线检查组件样式隔离。开发/watch 门禁使用隔离的编译器副本，依次添加样式、修改 token/导入、删除样式和恢复，每个阶段都显式重新编译并 reLaunch IDE 项目。

`wv relaunch/current-page/screenshot/compare/tap/page-data` 复用 Wevu 项目的显式端口，独立观察连接在 CLI 命令期间记录 AppService 错误，渲染探针检查 CLI 点击后的实际页面数据和样式。保留 CLI 全屏 diff，再按实测 `screenTop` 裁出应用视口，逐像素要求视口差异为 0（排除 IDE 状态栏时钟）。CLI 命令不再启动新项目。

证据包含 SDK/systemInfo、viewport 尺寸、样式探针、CLI 日志、异常和截图。框架探针用临时 headless Chromium 规范化最终 WXSS token 的颜色表示，并在 `finally` 关闭浏览器。Uni-app 后续工具链会把 OKLCH 转成 RGB，报告同时记录原始 token、最终 WXSS 值和 computed style，不放宽颜色断言；当前正式基础库的 WebView 将正 rpx 尺寸解析为整数 CSS 像素。验收环境是已安装的 IDE 模拟器，不是实体手机。

证据写入 `e2e-artifacts/devtools/`，包括官方来源、核对时间、版本声明、实际 SDK/systemInfo 和截图。先挂监听器，再启用日志转发。清理时排空 AppService 工作并完成一次 SDK 往返，保持观察连接直到所选 `cli close --project <唯一临时目录>` 完成且自有端口消失，再释放 SDK 连接、检查最终异常/console 错误并删除临时文件。某个步骤失败仍继续其余清理；操作、应用或清理错误都导致失败并保留证据。保留用户和其他任务的 IDE 窗口。仓库锁防止两轮 IDE E2E 同时启动。强杀/断电后需先核对资源归属再清理遗留锁和临时项目，不运行全局 kill/close 命令。

没有真实 AppID、稳定版证据或所选 IDE 时，入口直接报错。本次自动化覆盖结果仅包含实际执行成功的层；真实 IDE/真机结果必须单独记录。

## 后续维护

每次库逻辑变化先补失败用例，再修复根因。Panda 生成结构变化同时更新真实 codegen、AST 诊断、打包类型和框架产物回归；不要仅更新快照使 CI 通过。新增公开 API、配置分支或产物形态必须保持逐文件门禁，新增页面状态应加入浏览器/小程序对应场景。视觉与真机兼容性采用实际环境验收，不能用源码覆盖率推断。

2026-10-09 安全复核：新增官方 IDE SDK 带入的旧 minimist 已通过兼容的 mkdirp 补丁覆盖修复；审计告警与已有基线一致（low 6、moderate 33、high 24、critical 5），并非安全审计全通过。框架工具链的已有告警见 [依赖评估](./dependency-review-2026-10-09.md)。

## 层顺序回归

编译器单测覆盖嵌套、匿名、重复层、重要声明逆序、条件包装、诊断和显式 legacy 参数。三浏览器对安全输入比较展开后的 computed style 与原生 layer；高权重反例必须保留实际差异并产生警告/错误。Wevu 产物测试验证两个层演示节点的状态切换；真实 IDE 在点击前后及 `reLaunch` 后读取普通层顺序、重要层逆序的精确颜色，保存 `layer-styles.json` 与截图。mpcore 不验证 CSS 排版。真实 AppID 仅注入临时项目，不把其他 fixture 的 `trial` 当作正式基础库基线。
