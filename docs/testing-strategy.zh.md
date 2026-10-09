# 测试策略与验收

目标是让两包的**全部 `packages/*/src/**/*.ts` 自有源码**达到 100% 语句、分支、函数和行覆盖，并用真实生成、打包消费和页面交互验证行为。覆盖率逐文件检查，未被导入的源码也进入统计；不通过忽略标记或排除难测的库文件提高数字。框架生成代码、示例和测试脚本不属于该源码分母，分别由集成/E2E 门禁验证。100% 代码覆盖率不等于穷尽所有输入、设备和渲染行为。

## 测试分层

| 层             | 验证内容                                                                                                                                    | 入口                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 编码契约       | ASCII、Unicode 各平面、代理码元、前导数字/连字符、空白、保留标记、碰撞、独立解码往返                                                        | runtime Vitest                 |
| 配置与 AST     | 配置不变性、Babel ESM/CJS 互操作、版本诊断、损坏/不完整产物、重复处理、属性描述符、symbol 和 `.raw`                                         | adapter Vitest                 |
| CSS            | Web/weapp 目标、变量校验、cascade layer、`:where`、`:not`、选择器上下文、多个替换的组合、disabled 生命周期                                  | adapter Vitest/快照            |
| 真实 Panda     | 2.1.2 的 `.js`/`.mjs`、class hash、codegen/PostCSS 自动生成与配置重载；css/cva/sva、named/slot recipe、compound、pattern、styled、cx、token | Panda 集成测试                 |
| 发布消费       | 两包 tarball、离线隔离安装、ESM/CJS、类型解析、入口函数身份、runtime 无依赖、自包含工厂                                                     | packed-runtime/entrypoints/tsd |
| 框架产物       | Taro React/Vue、Uni-app 小程序/H5 的最终 WXSS/CSS 与实际生成 runtime 类名匹配                                                               | taro-artifacts/uni-artifacts   |
| 小程序逻辑 E2E | 真实 Wevu 编译产物、组件注册/渲染、点击、class 更新、WXSS 匹配、独立运行时状态隔离与重启                                                    | mpcore integration             |
| 浏览器 E2E     | React **生产构建**，三引擎 computed style、hover、compound/slot 切换、重复交互、reload、窄屏、手写碰撞名、控制台错误                        | Playwright                     |
| 真实微信验收   | 真实 IDE 的 AppService、样式变化、WXSS 匹配、reLaunch 状态重置和截图                                                                        | 可选 DevTools 入口             |

小程序逻辑 E2E 使用 `@mpcore/weapp-vite` 构建真实应用，再由 `@mpcore/test` 运行 WXML。它不模拟微信 CSS 排版，也不替代真实开发者工具或手机验收。Taro/Uni 的产物测试保证输出匹配，不宣称验证了这些框架的真实点击交互。

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

## 真实微信开发者工具

该入口显式启用，不在没有 GUI/账号的 CI 中静默跳过。运行前从 [官方稳定版下载页](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html) 核对最新稳定版，确认所选安装与实际宿主版本一致、已登录且服务端口已开启。不得因为失败而回退 RC/nightly 或其他安装。

设置以下环境变量后运行 `pnpm test:e2e:devtools`：

| 变量                                        | 含义                                                      |
| ------------------------------------------- | --------------------------------------------------------- |
| `WEAPP_VITE_E2E_DEVTOOLS_CLI_PATH`          | 所选稳定 IDE CLI 的绝对路径；预检、启动、清理使用同一路径 |
| `WEAPP_VITE_E2E_APPID`                      | 有权限的真实 AppID，拒绝 touristappid                     |
| `WEAPP_VITE_E2E_DEVTOOLS_STABLE_VERSION`    | 本轮官方渠道核对的最新稳定版本                            |
| `WEAPP_VITE_E2E_DEVTOOLS_INSTALLED_VERSION` | 本轮核对的实际 IDE 宿主版本，须与稳定版一致               |
| `WEAPP_VITE_E2E_DEVTOOLS_CHECKED_AT`        | 核对时间 ISO 字符串，须在 24 小时内                       |

版本值属于操作者提供的验收证据，SDK 不会自动判断发行渠道；记录不能替代实际核对。入口只启动一个自动化连接，通过 `reLaunch` 切换两轮场景，不重复启动 IDE。应用复制到唯一临时目录，在临时配置中注入 AppID 与调试路由；仓库保持 touristappid，避免提交个人配置。

证据写入 `e2e-artifacts/devtools/`，包括官方来源、核对时间、版本声明、实际 SDK/systemInfo 和截图。`finally` 断开连接、使用 `cli close --project <唯一临时目录>` 关闭该项目并删除临时文件；保留用户和其他任务的 IDE 窗口。清理错误导致失败。仓库锁防止两轮 IDE E2E 同时启动。强杀/断电后需先核对资源归属再清理遗留锁和临时项目，不运行全局 kill/close 命令。

没有真实 AppID、稳定版证据或所选 IDE 时，入口直接报错。本次自动化覆盖结果仅包含实际执行成功的层；真实 IDE/真机结果必须单独记录。

## 后续维护

每次库逻辑变化先补失败用例，再修复根因。Panda 生成结构变化同时更新真实 codegen、AST 诊断、打包类型和框架产物回归；不要仅更新快照使 CI 通过。新增公开 API、配置分支或产物形态必须保持逐文件门禁，新增页面状态应加入浏览器/小程序对应场景。视觉与真机兼容性采用实际环境验收，不能用源码覆盖率推断。

2026-10-09 安全复核：新增官方 IDE SDK 带入的旧 minimist 已通过兼容的 mkdirp 补丁覆盖修复；审计告警与已有基线一致（low 6、moderate 33、high 24、critical 5），并非安全审计全通过。框架工具链的已有告警见 [依赖评估](./dependency-review-2026-10-09.md)。
