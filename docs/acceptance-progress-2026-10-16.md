# 完整用户场景验收进度（2026-10-16）

本轮 goal 尚未完成，真实 IDE 验收成功轮次为 **0/2**。当前工作区基于 `a7a83c9b4b9517b8eb8bfd75e68337db44f2257c`，新增验收实现与示例修复尚未提交或推送。这份记录区分已经执行的测试和待执行的 IDE 断言，不能作为最终候选提交的验收报告。

## 实现

- 新增 `pnpm test:acceptance`，串行执行全部门禁、开发增量验收、四框架重新构建，以及同一干净提交的两轮真实 IDE 测试。缺少前置条件直接失败；记录 SHA、构建文件哈希、浏览器版本及原有本地文件哈希。
- 保留单轮 `pnpm test:e2e:devtools`，扩展 Wevu、Taro React/Vue、Uni 和原生 tarball 消费者。每项目两次 reLaunch、四次连续切换，检查数据、文案、class、实际样式、布局、滚动、neutral 截图和清理。AppService 观察连接保持到自有项目关闭完成，最后统一检查异常。
- 原生项目由真正安装本地 adapter/runtime tarball 的消费者生成，保留安装解析记录、tarball 哈希及不含项目 AppID 的实际生成产物。包含 inline/named recipe 和 slot、变量、组件隔离、负数及 calc 布局。
- Uni Panda/Tailwind 按钮原先只在初始化计算 props 样式；真实 Chromium 回归先复现失败，再改为响应式 `computed`。新增 H5 三引擎、动态 props、预处理器、imports/layers 与 NutUI 交互场景。
- H5 子组件在四次切换和 reload 后增加精确背景、字号及四向间距断言；Taro Vue 配方的间距显式覆盖 H5 全局 reset，保持原生 `<view>`。文档部署门禁新增可重复执行的 `_headers`、ARD、robots/sitemap 和 LLM 发现产物检查。
- Taro React H5 保持启用 prebundle；通过 pnpm 补丁恢复 Webpack 插件状态、隔离 remote 模块/分块编号、继承实际构建模式并淘汰旧 remote 缓存，完成真实编译与运行回归。
- IDE runner 的锁冲突现在写出明确 failed 结果；成功结果与成功日志仅在自有资源清理、锁释放和取消检查完成后写出。共享场景增加 `min-height: calc(100vh + 2rem)` 及实际高度断言，04:43 矩阵已验证四框架各两次真实滚动。
- 更新现行双语文档中的 css-compat 版本说明；保留历史评估记录原文。浏览器自动重试关闭。

## 已执行结果

本地任务证据目录为 `/tmp/weapp-pandacss-upgrade-20261015-F3VK7O`。私有工作区使用 Node 24.21.0 和原生 pnpm 12.11.2；通过临时 PATH 入口固定子进程版本。

| 项目                        | 实际结果与证据                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frozen install              | 最终 prebundle 补丁后 frozen install 通过，`goal-frozen-runtime-patch-final.log`。较早记录 `goal-frozen-post-taro-patch.log` 保留。                                                                                                                                                                                                                                                                       |
| 工作区质量门禁              | 最新完整 `pnpm validate` 通过：37 个测试文件、428/428 项、逐文件 statements/branches/functions/lines 均为 100%，以及构建、lint、类型和 tsd 门禁，`goal-validate-native-binding-typed-height.log`。前两次 validate 分别发现新 CSS 注释缺空行、场景类型缺少 windowHeight；已修正，保留 `goal-validate-native-binding-final.log` 和 `goal-validate-native-binding-format-fix.log`。较早 385/373 项记录保留。 |
| 发布内容                    | 最终补丁后 `pnpm pack:check` 通过，`goal-pack-runtime-patch-final.log`；较早 `goal-pack-post-taro-patch.log` 保留。                                                                                                                                                                                                                                                                                       |
| repoctl                     | 最终实现后 doctor 87 pass/59 warn/0 fail、`check --full`、deps check 和 catalog check 全部通过，`goal-doctor-runtime-patch-final.log`、`goal-repo-check-native-binding-final.log`、`goal-deps-runtime-patch-final.log`、`goal-catalog-runtime-patch-final.log`。full check 再次运行完整 428 项测试和相关类型/构建。较早记录保留。                                                                         |
| 安全审计                    | 最终补丁后保留 61 条已有 GHSA（3 critical、19 high、33 moderate、6 low），没有新增公告、版本、严重度或锁文件依赖链，`goal-audit-runtime-patch-final.log`；这不是零漏洞审计。较早 `goal-audit-two-vendor-patches.log` 保留。                                                                                                                                                                               |
| 真实消费安装                | 最新 Node 22.18.0/24.11.0 × Panda 2.1.2/2.2.0 四格通过；实际离线安装、codegen/cssgen/build、ESM/CJS、公开类型、8 种模式和 11 个负例，`goal-consumer-post-taro-patch/consumer-report.json`。较早检查点保留于 `consumer-evidence-inline-layout/consumer-report.json`                                                                                                                                        |
| Wevu 构建/运行              | 最新 6 项通过，`goal-weapp-post-taro-patch.log`；此层不验证 IDE CSS 布局，较早记录为 `goal-weapp.log`                                                                                                                                                                                                                                                                                                     |
| React Web                   | 最新三引擎 42 项通过，`goal-react-web-post-taro-patch.log`；较早记录为 `goal-react-web.log`                                                                                                                                                                                                                                                                                                               |
| 框架 H5                     | 最新完整 `pnpm test:e2e:h5` 通过：三框架构建与三引擎 24/24，`goal-h5-runtime-final.log`。Taro React prebundle 始终启用；旧的 18 通过/6 React 失败保留于 `goal-h5-prebundle-patched.log`，已由编号隔离和生产模式兼容修复。更早 24 项通过记录保留于 `/tmp/panda-scenarios-h5-final.log`                                                                                                                     |
| H5 预打包缓存复用           | 重复 React H5 构建通过，46 个 prebundle/remote/metadata 文件的 SHA256、大小和修改时间全部不变；remote compiler 未执行、host compiler 执行且无回退。随后原始三服务配置下 React 三引擎 6/6，`goal-h5-react-cache-result.json`、`goal-h5-react-runtime-cache.log`、`goal-h5-react-runtime-cache-browsers.log`                                                                                                |
| 文档站                      | 最新三引擎 118 项通过、2 项既有浏览器能力跳过，`goal-docs-current-three-engine.log`；Firefox/WebKit 跳过真实剪贴板权限用例，复制回退仍执行。较早记录保留于 `goal-docs-three-engine-isolated.log`                                                                                                                                                                                                          |
| 文档发布预检                | 最新 Wrangler dry-run、54 页/316 assets，以及可重复静态检查的 108 文本导出、5 个 LLM 目录、2 个 ARD 入口和逐路由 header 规则通过，`goal-docs-deploy-reproducible-check.log`。示例在构建完成后串行检查通过，`goal-docs-examples-after-ide-build.log`；较早本地 HTTP 的 9 条 header 路由检查保留于 `goal-docs-discovery.log`                                                                                |
| 开发增量编译                | 四框架共 20 阶段通过；新增样式、修改 token/imports、删除、恢复，编译器保持同一 PID，最后全部停止且临时目录移除，`/tmp/panda-watch-compile-v3-evidence`                                                                                                                                                                                                                                                    |
| 取消与证据保护              | SIGTERM 后非零退出、结果明确失败、自有编译器停止、临时目录清理；拒绝复用旧证据目录且旧结果未改变，`/tmp/panda-watch-cancel-evidence`                                                                                                                                                                                                                                                                      |
| 真实 IDE 单轮               | 最新 04:43 矩阵仅六次零像素比较失败：React 512/512、Vue 345/345、Uni 831/888。四框架各两次滚动 0→100、四次切换和 class/实际样式恢复均通过；Wevu/原生各两次截图为 0。全部自有项目、端点、目录清理成功，AppService 异常和应用错误为 0；完整成功轮次仍为 0/2。证据 `e2e-artifacts/devtools/2026-10-16T04-43-52.908Z/`。                                                                                      |
| 实际 IDE watch              | 04:15 四框架共 20 阶段全部通过；每框架保持同一编译器 PID，各阶段使用新项目和连接。20 份项目清理与 4 份编译器清理全部成功，整套 `passed=true`、`runtimeVerified=true`，见 `e2e-artifacts/watch/2026-10-16T04-15-17.086Z/`。这仍是未提交候选的检查点                                                                                                                                                        |
| Taro HTML 运行时回归        | 实际 core hydrate、事件目标、辅助函数与 HTML 钩子共同执行：上游 7 项中 4 项失败，官方 pnpm 补丁安装后 7/7 通过；包类型检查及相关 ESLint 通过，`taro-html-hydration-proof.json`。03:52 真实 IDE 两次 reLaunch 的 class 恢复及 NutUI 开关也通过，截图门禁仍失败                                                                                                                                             |
| Taro Webpack prebundle 回归 | 上游 6 项实际插件入口均失败，首版候选 6/6；新增真实 host/remote 编号碰撞执行与 5 项环境定义回归后，最终补丁 12/12，纳入最新 428 项测试。完整 H5 24/24 与缓存复用另行通过；证据为 `taro-prebundle-webpack-proof.json`、`taro-prebundle-runtime-proof.json` 及串行日志。                                                                                                                                    |

Panda watch 会暂时保留未使用的原子 CSS；四框架均观察到这一缓存行为。删除阶段要求新增样式从可执行 bundle 和运行 class 移除，真实 IDE 还必须验证 border 恢复 0；不宣称 CSS 已即时瘦身，也不把增量编译当作保留交互状态的 HMR 测试。

消费者公开类型采用仓库既有 `skipLibCheck` 策略，同时单独执行完整声明检查并只接受已记录的 Panda 上游 TS2308 重复导出诊断。公开 API 的正负类型断言、ESM/CJS 编译和执行均实际运行，不宣称上游声明内部无错误。

上表记录各命令实际完成时的结果，尚未证明后续 IDE 修复后的最终候选也通过全部门禁。最终候选仍须重新执行完整串行验收。

## IDE 恢复后的实际结果

官方配置确认稳定版为 **2.02.2608080**。官方 ARM64 安装包 MD5 为 `f575c5cd86b85c0f42e38e7be2ced1ad`，Tencent/Apple 签名与完整代码签名验证通过。系统安装与保留官方包的 7 项文件 SHA256 一致（包含 app.asar、Electron、CLI、真实 CLI 入口和 CodeResources），直接读取两份 ASAR 内的包版本均为 2.02.2608080；见任务证据目录的 `goal-system-stable-file-identity.json`。系统安装的严格完整签名复核也通过，见 `goal-system-stable-codesign.log`。本次实际使用 `/Applications/wechatwebdevtools.app/Contents/MacOS/cli`，未替换或移除系统安装。

此前单轮预检曾在打开临时项目之前因会话身份无法核实而失败，记录在 `e2e-artifacts/devtools/2026-10-16T02-00-25.092Z/`。恢复后的系统 CLI doctor 已确认登录为 true、服务端口 **20343** 已开启，见任务证据目录的 `goal-system-stable-doctor.log`。doctor 仍保留 automator 会话身份 warning，后续实际自动化连接已取得 `Tool.getInfo` 与设备数据；不再以先前的登录/端口 unknown 或锁屏状态作为当前阻塞。

实际单轮证据目录为 `e2e-artifacts/devtools/2026-10-16T02-58-18.696Z/`，`environment.json` 记录了稳定 IDE **2.02.2608080**、实际 SDK **3.13.2**、设备 iPhone 12/13 (Pro)、`windowWidth=390`、`windowHeight=753`、`screenWidth=390`、`screenHeight=844`、`screenTop=91` 及像素比 3。这些数值来自本次运行，页面 `size()` 的观测值单独保存在 `viewport.json`，不将其当作设备视口尺寸。

`result.json` 明确为 failed：Wevu 进入新增共享场景后，在 `#scenario-variable` 的 class 与已发出 WXSS 匹配断言处失败。已有 Wevu 基础页面的 class/实际样式探针保存在 `runtime-probes.json`；这不能替代新增共享场景、其余三框架或原生消费者的完整验收。该运行观察到的 `console.json` 异常和日志数组为空，仅覆盖实际执行到的区间。

02:58 这次失败路径的 `cleanup.json` 确认 `closed=true`、`endpointClosed=true`、`removed=true`，对应自有临时项目关闭、自动化端点关闭及目录移除。`result.json` 中列出的 framework/native 清理文件只是预期证据位置；这次尚未进入这些项目，不能据此声称它们已执行或清理通过。历史授权 AppID 仅注入临时项目，没有提交实际 AppID，也没有关闭其他任务的 IDE 项目。

后续已完成的检查点如下。每次均保留单独目录，没有把修复后尚未执行的断言算作通过：

| 证据目录（`e2e-artifacts/devtools/` 下） | 实际停止位置                                                                                                                                                                                                                                                                |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `2026-10-16T02-58-18.696Z/`              | Wevu `scenario-variable` class/WXSS 匹配断言失败                                                                                                                                                                                                                            |
| `2026-10-16T03-02-59.657Z/`              | Wevu `scenario-units.padding-top`：预期 0px、实际 1px，非零极小 rpx 的实际观测与换算预期不符                                                                                                                                                                                |
| `2026-10-16T03-05-17.997Z/`              | Wevu 首轮 neutral 截图比较失败，`wevu-0-pixels/cli-viewport-compare.json` 记录 13131 个差异像素；零像素门禁未通过                                                                                                                                                           |
| `2026-10-16T03-09-38.886Z/`              | Wevu 两次 reLaunch 及共享场景通过；两个 `wevu-*-pixels`、CLI 重复/恢复后的精确裁剪比较均为 0。Taro React 完成四次切换及样式断言后，`taro-react-0-pixels/cli-viewport-compare.json` 记录 1530 个差异像素，整轮失败                                                           |
| `2026-10-16T03-27-37.644Z/`              | 五路线均已实际运行。Wevu 和原生消费者各两次 reLaunch 的探针与截图通过；Taro React 两次 neutral 截图分别为 1665/1153 个差异像素，Taro Vue 两次在 `h5-view` class 恢复断言处失败，Uni 两次在 `ACCENT`/`accent` 文案断言处失败；聚合结果为 failed                              |
| `2026-10-16T03-38-58.186Z/`              | Wevu 和原生仍各两次通过，截图均为 0。Taro React、Taro Vue、Uni 均完成四次切换及 class/样式恢复，截图分别为 1665/1665、2150/2150、890/890 个差异像素。Taro Vue 移除原生 view 的 HTML 映射后，NutUI 的点击关闭两次失败；该配置修复不接受为最终实现                            |
| `2026-10-16T03-52-13.529Z/`              | 标准 HTML 配置与 pnpm 补丁生效：三框架各两次 reLaunch 的四次切换、文案、class/样式及恢复均通过；Taro Vue 两次分别记录 closed/open/closed/open/closed。仅六次截图失败：React 1757/1920、Vue 2150/967、Uni 1255/1255 个差异像素。Wevu 和原生各两次仍均为 0；聚合结果为 failed |
| `2026-10-16T04-29-27.675Z/`              | 实际项目编译设置和前置滚动探针生效；Wevu/原生各两次通过。React 两次截图差异 1532/1665、Vue 967/2150；Uni 两次在实际页面滚动断言处失败，未到截图比较。聚合结果 failed，04:32 完成；自有项目、端点和临时目录全部清理通过                                                      |

上述检查点的自有项目关闭、端点关闭及目录移除均为 true。03:27 的 `cleanup.json`、`framework-cleanup.json` 和 `native/cleanup.json` 分别确认 Wevu、三个框架项目及原生消费者的清理；没有把早期未进入的项目计作已执行。

03:27 矩阵的实际范围如下，单路线通过不等于最终两轮验收通过：

| 路线                | 已执行结果与剩余断言                                                                                                                                           |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wevu                | 两次 reLaunch、共享场景、CLI 数据/渲染及重复/恢复截图通过；四个精确裁剪比较均为 0 个差异像素                                                                   |
| 原生 tarball 消费者 | 两次 reLaunch、inline/named recipe 与 slot、变量、组件隔离、负数/calc 几何和滚动探针通过；两次 neutral 比较均为 0，`native/probes.json` 含实际观测             |
| Taro React          | 两次 reLaunch 中四次切换的 class、文案、样式及恢复断言均执行通过；截图比较失败，差异为 1665/1153，其后的实际滚动断言尚未到达                                   |
| Taro Vue            | 基础样式探针通过；共享场景恢复 neutral 时额外出现 `h5-view`，完整 class 字符串比较失败。修复尚待构建及实际重跑；不能跳过该 class 断言计为通过                  |
| Uni                 | 基础样式及 active 状态样式探针通过；实际 `text-transform: uppercase` 使渲染文案成为 `ACCENT`，与原先 `accent` 预期冲突。预期已按实际渲染语义修正，仍待实际重跑 |
| NutUI               | Taro Vue 的两次 reLaunch 各完成两轮打开/关闭；实际文案、display、opacity 及覆盖层尺寸通过，见两个 `taro-vue-*-nutui.json`；不代替 Taro Vue 共享场景通过        |

此前 03:09 的 Taro React neutral 差异集中在 7 条水平像素行，RGB 通道差值很小。独立诊断 `/tmp/panda-cdp-diagnostic-1792120613246/result.json` 再次观察到 1920 个差异像素，最大通道差值为 1，四次切换后回到 neutral，诊断自有项目清理通过。这些是定位用的证据；03:27 检查点的零像素门禁仍失败，没有改用容差判定通过。

该独立诊断的 CDP 请求均返回 `appservice App.CDPEnable unimplemented`，包括协议列表、运行脚本、布局度量和截图，`layout-metrics.json` 明确 unavailable；固定 SDK 下没有取得可用的 CDP 替代截图。官方实现已确认模拟器缩放为 94%，截图会按模拟器尺寸适配输出；项目局部 100% 缩放的诊断尚未建立消除该差异的证据，不宣称根因已修复。

实际 IDE watch 的 `e2e-artifacts/watch/2026-10-16T03-32-23.098Z/` 仅完成 Wevu 初始编译输出，随后调用 `Tool.compile` 返回 unimplemented，初始、新增、修改、删除和恢复阶段的实际渲染在该轮均未验证。`wevu/probes.json` 和总 `result.json` 均明确失败且 `runtimeVerified=false`；`wevu/cleanup.json` 确认自有 IDE 项目和端点关闭、目录移除，`wevu/watch-cleanup.json` 确认编译器已停止且临时工作区移除。兼容修复改为每个稳定输出阶段使用自有临时项目重新编译，保持同一 watch 编译器运行；后续实际通过记录见 04:15 检查点，不作为保持交互状态的 HMR 证明。

桌面工具再次报告 Mac 锁定，但已验证 CLI 仍可工作，当前仍有可执行的诊断与项目配置路径，因此没有将锁屏本身重新记为外部阻塞。未以此跳过剩余门禁，也没有尝试关闭其他任务的 IDE。

03:38 矩阵所有自有项目关闭、端点关闭及目录移除均通过，框架 AppService 异常数组为空。后续已补充失败路径的场景记录持久化，避免截图失败丢失前面的实际探针；最终两轮还会冻结两个发布包的 dist 内容及四框架产物，防止忽略目录中的发布内容在两轮间变化。

固定流程截图诊断 `/tmp/panda-capture-stabilization-1792122177363/` 比较原始 PNG：无点击的两次 neutral、四次点击、实际滚动 1→0 三组均为 1920 个差异像素，最大通道差值 1；固定每状态一次预热后仍为 458。四组自有项目均清理通过。这证明没有点击也会出现差异，但尚未证明具体合成阶段的根因；没有添加掩码、颜色量化、容差或重试。

03:47 Wevu watch 的五阶段来自同一编译器 PID 68095，各阶段使用全新临时 IDE 项目和连接，真实背景、imports、token、边框新增/删除和文案断言通过。五份项目清理记录的端点关闭和目录移除均为 true，编译器停止及隔离工作区移除通过；这不是最终候选的完整四框架 watch 验收。

Taro HTML 兼容修复已通过官方 `pnpm patch` / `patch-commit` 流程安装，`patches/@tarojs__plugin-html@4.3.0.patch` 仅修改源码和分发运行时的节点名读取。Taro core 在 HTML 钩子之前将原生 `view` 优化为 `pure-view`、`static-view`、`click-view` 或 `catch-view`，上游钩子从 `data.nn` 读取优化后的名称，导致首次缺少 `h5-view`，更新时却添加该前缀。补丁从 `node.nodeName` 读取原始标签，保持原有节点别名优化；五种节点类型的首次 class、更新和恢复均稳定，click→tap 触发及移除、普通 HTML 标签映射也通过。上游实际运行时对照 7 项中 4 项失败，补丁安装后 7/7 通过；证据为任务目录中的 `taro-html-hydration-proof.json`，回归入口为 `packages/weapp-pandacss/test/taro-html-hydration.test.ts`。Vue 标准 HTML 插件配置已恢复，ScenarioCard 保留原生 `<view>`，未采用排除 `view` 或更换标签的规避方案。测试加载器只读取固定的已安装 vendor 源文件，VM 环境只提供测试所需的两个固定环境值，不读取本地 `.env` 或真实 AppID，也不输出宿主环境变量。

03:52 的补丁后矩阵已于 03:56 完成，最终失败仅含上述六次框架截图比较。Taro Vue 两次 reLaunch 都完成原生 view 的首次 class 与四次状态更新/恢复，并各完成 NutUI 两轮打开和关闭，证明标准 HTML 映射下事件兼容修复实际生效。五路线自有项目、端点和临时目录均清理通过，AppService 异常记录为空；不能据此将截图之后尚未到达的框架滚动断言计为通过。

03:56 四框架 watch 中，Wevu 和 Taro React 各五阶段均通过实际渲染，编译器 PID 分别保持为 77043 和 77819。Taro Vue 开发输出完成，SDK 连接已取得，但首阶段 `App.enableLog` 超时，未写出该阶段的 `environment.json`；console 记录为空不证明应用初始化正常。Taro Vue 只记录初始编译观测，后四阶段及 Uni 全部阶段尚未执行。所有已启动的自有 IDE 项目、端点、编译器和工作区清理通过；套件总结果为 failed、`runtimeVerified=false`。原失败输出已随工作区清理移除，正在补充保留失败产物后的受控复现，尚无新的通过证据。

当前完整成功轮次仍为 **0/2**。最新完整 validate 428 项及四项 100% 覆盖率、完整 H5 三引擎 24 项、缓存复用后的 React 6 项均通过；四框架 watch 的 20 阶段通过记录保留。04:43 五路线 IDE 矩阵已验证高度修复后的全部滚动、交互和清理，仅三框架的六次零像素比较失败。新的原生产物比对已通过 43 项定向回归，以及两次真实离线安装/生成的 124 文件一致性验证，原生路线的两次独立 IDE 检查亦已通过，四次 reLaunch 的 neutral 截图均为 0，且两轮 124 文件身份相同；这些不能替代完整矩阵两轮成功。提交候选后仍须对同一干净提交执行完整串行门禁。当前 HEAD 和本地 origin/main 仍为 `a7a83c9b4b9517b8eb8bfd75e68337db44f2257c`；本轮未提交或推送，也尚未做最终推送后的远端 SHA 核验。

04:08 的 Vue watch 受控复现保留了失败构建、Tool 版本信息和单次有界启动截图；截图停在官方 `getDevCodeByFileList-miniProgram` 阶段，尚未进入 AppService。相同 JavaScript 去掉外部 SourceMap 仍失败；保留全部原始字节和 SourceMap，仅将临时项目 `es6` 从 true 恢复为示例声明的 false 后，真实 IDE 启动及背景断言通过，见任务目录 `vue-dev-es6-false-xGrqcm/result.json`。验收工具现从实际项目配置读取编译设置白名单，不复制 AppID 或 packNpm 路径配置，并记录生效设置。这是临时验收配置错误的修正，不是 adapter 发布行为变更。

04:15 四框架 watch 的编译器 PID 分别保持为 Wevu 96475、React 97990、Vue 98943、Uni 9357；20 个阶段分别验证新增样式、token/imports 修改、删除、恢复及初始渲染。每阶段显式 reLaunch 后，背景、颜色、单位、token、边框和文案断言通过；20 个自有项目、连接、临时目录及 4 个编译器/工作区均完成清理。

H5 精确断言曾在三个引擎同时发现 Vue 配方 padding 预期约 8.32px、实际为 0px。真实浏览器 CSSOM 确认未分层的 `* { margin: 0; padding: 0; }` 覆盖了 `utilities` 层的 `padding: 0.4rem`，证据为 `h5-vue-padding-cascade.json`。配方改为 `0.5rem !important` 后保留原精确预期，Chromium/WebKit 定向用例通过；Firefox 首次因缺少约定的 profile 环境变量在浏览器启动前失败，补齐固定的 `MOZ_APP_DATA` 和 `MOZ_LOCAL_APP_DATA` 后定向用例通过，见 `h5-vue-exact-props-recheck.log`、`h5-vue-exact-props-firefox-fixed.log`。浏览器重试仍为 0，未降低断言或跳过用例。

随后通过 `pnpm patch` 安装 `@tarojs/webpack5-prebundle@4.3.0` 的首版 Webpack 兼容补丁，6 项上游失败/候选通过的对照只证明插件入口兼容。该检查点真正执行 esbuild 预打包与 remote/host 编译，生成新 remoteEntry 和 metadata，没有以预编译失败后的回退路径作为成功证据；完整 H5 当时为 18 项通过、6 项 React 失败，`jsxs` 所属 JSX runtime 为 undefined，原记录保留于 `goal-h5-prebundle-patched.log`。

运行期根因由实际产物确认：remote 与 host 有意共用 Webpack JSONP 和模块缓存，但分别执行 deterministic ID 分配。host chunk 814 中的模块 802 为 CSS URL helper，remote chunk 947 中的模块 802 为 `react/jsx-runtime`；remote 读取了 host 已缓存模块，得到 undefined。另一个独立问题是 prebundle 的 `getDefines()` 只读取链上的显式 DefinePlugin，漏掉 Webpack 的构建模式，导致生产 host 配上 esbuild 默认生成的开发版 React，出现 `createRoot` 入口警告。

最终 `patches/@tarojs__webpack5-prebundle@4.3.0.patch` 为 4 个分发文件、38 行新增/3 行删除（补丁文件 101 行、5501 字节）。保留首版对 `_options`、`_remotes` 和 `_remoteType` 的兼容初始化，并在 remote 最终 ID 优化后为模块和分块添加幂等命名空间，跳过空模块 ID，保持 chunk name。环境定义遵循显式 DefinePlugin 覆盖、`optimization.nodeEnv`、production/development mode 的顺序；显式 `nodeEnv: false` 保持关闭。缓存 hash 增加命名空间版本，避免已有 metadata 复用旧编号产物。React 的 `enable: cssTarget === 'web'` 保持启用。

对照回归使用实际安装的 Webpack 父类和 Taro 源码：原上游 6 个插件入口全失败，首版候选 6/6 通过；新增用例强制独立编译的 host/remote 模块与分块都使用编号 802，首版候选执行失败，最终候选在共享 VM runtime 中成功返回远端值。另有 5 项 production/development、自定义 nodeEnv、显式覆盖和禁用定义用例；最终安装补丁后共 12/12。证据为 `taro-prebundle-webpack-proof.json`、`taro-prebundle-runtime-proof.json` 和 `packages/weapp-pandacss/test/taro-prebundle-webpack.test.ts`。fixture 不在 `src/**` 覆盖率范围内，未放宽已有阈值。

首轮全套单元测试曾与 H5/mini 构建争用 Taro 输出目录；`taro-artifacts.test.ts` 本身会执行框架构建，当时结果为 384 项通过、1 项 Vue H5 构建失败，原记录保留于 `goal-tests-full-prebundle-runtime.log`。停止其他构建后串行运行 `pnpm test`，36 个测试文件、385/385 项通过，statements 371/371、branches 334/334、functions 102/102、lines 341/341 均为 100%，后续公开类型及 10 个构建/测试任务也通过，见 `goal-tests-prebundle-runtime-serial.log`。没有用并发失败记录替代串行通过记录，也未删除该失败。

串行全量 `pnpm test:e2e:h5` 随后完成三框架构建和 Chromium/Firefox/WebKit 共 24/24 项验收，`goal-h5-runtime-final.log`。修复后的 JSX core 使用生产源码，体积由 48926 字节降为 2457 字节。首次定向浏览器运行中，Firefox 因缺少约定的 profile 环境变量在启动前失败；保留 `goal-h5-react-runtime-browsers.log`，补齐 `MOZ_APP_DATA`、`MOZ_LOCAL_APP_DATA` 后两项通过，`goal-h5-react-runtime-firefox.log`。最终完整 24 项使用三服务原配置与上述已验证环境，未降低运行时异常、资源加载或精确样式断言。

重复 React H5 构建进一步确认缓存路径：46 个 prebundle、remote 和 metadata 文件的大小、SHA256、修改时间全部不变，remote compiler 未执行，host compiler 实际执行且无回退；`goal-h5-react-cache-before.json`、`goal-h5-react-cache-after.json`、`goal-h5-react-cache-result.json` 和 `goal-h5-react-runtime-cache.log` 记录完整对照。缓存复用后，在原始三服务配置下 React 三引擎 6/6 通过，`goal-h5-react-runtime-cache-browsers.log`。这些浏览器结果不代替尚未完成的两轮真实 IDE 验收。

一次 `check:examples` 与 adapter 强制构建争用 `dist`，使 Panda 配置暂时无法解析 `weapp-pandacss/panda`；失败原记录保留于 `goal-docs-examples-current.log`。这是共享输出目录的调度冲突，不能当作产品失败，也没有抹去该次命令失败。构建完成后串行执行的 `goal-docs-examples-after-ide-build.log` 已通过；完整验收 runner 采用串行调度，不为此增加自动重试。文档部署门禁现在将静态发现产物检查接在 Wrangler dry-run 后，实际 HTTP header 应用与生成规则检查仍分别记录。

截至 04:43 检查点，React/Vue/Uni 零像素截图仍没有通过证据。官方 SDK 与 CLI 使用同一冻结/重排截图流程，未找到公开的项目级替代截图或 GPU 设置。此前曾请求协调共享稳定 IDE，以 `--disable-gpu` 完整重启作受控诊断；这不是已经完成或通过的检查，不据此退出或终止其他 IDE 会话，也不将候选标为通过。

原有 `examples/taro-app/.env.test`、`examples/taro-app-linaria/.env.test` 和 `stats/` 保留。

04:43 的全矩阵记录确认 Uni 的原先滚动失败来自测试内容不足：面板明确超过实际 753px 应用视口后，四框架各两次真实滚动均为 0→100，全部四次连续切换及恢复断言通过。六组截图差异分布在少数水平行，最大通道差值为 1–2，见任务证据 `goal-ide-scroll-pixel-analysis.json`；这仍未达到零像素要求，不据此降低判定阈值。该轮加载的是原生产物比对扩展之前的 native 模块，不能作为新比对实现的 IDE 验证。

原生两轮绑定现重新读取两份实际 tarball、规范化安装元数据、全部输入与生成代码以及完整 miniprogram。安装元数据仅统一两份已核验 tarball 的临时路径，保留版本、integrity、peer 和未知 file 引用；源码及小程序按原始字节比较。每轮 IDE 使用已保存、已 hash 的 app 副本，验收完成前重新核对两轮证据。43 项回归涵盖路径等价、依赖和输入变化、文件增删/篡改、伪造记录、失败结果和 SHA。两次独立重 pack、离线安装和生成构建实际得到相同的 124 文件身份 `1ef82c6cc9a50703c00e98e9422a3bba501b4442b2ef5485a478055fbf06d223`，临时输入清理成功，见 `goal-native-real-fixture-identity/result.json`；该验证明确 `ideRun=false`。

原生产物比对扩展的真实 IDE 验证现已完成：`goal-native-binding-real-ide/result.json` 明确 `nativeOnly=true`、`completeMatrix=false`、`passed=true`。两次均重新 pack/离线安装/生成、创建独立临时 IDE 项目和连接，各两次 reLaunch 与四次连续切换均通过；四次 neutral 截图差异全部为 0，AppService 异常及应用错误全部为 0，两个自有项目/端点关闭、临时目录删除全部成功。两轮实际保留文件数为 124、身份均为上述 `1ef82c6c…06d223`。该检查不增加完整矩阵成功轮次，仍为 0/2。

最新的 `pnpm validate` 与 `repo check --full` 均已完成通过；前者和后者各运行 428 项测试并保持逐文件四项 100%。发布内容、冻结安装、依赖一致性、catalog、doctor 和完整安全基线比较均已通过。实际 AppID 扫描没有在 85 个拟提交源码文件中发现授权值；原有未跟踪文件保留。剩余的完整 IDE 零像素失败尚未解决，因此尚未提交或推送本轮变更，不能把这些局部门禁通过当作最终目标完成。

## IDE 重启后的受控通过

在获得授权后，官方稳定 IDE 以 `--disable-gpu --force-device-scale-factor=2` 重启；子进程实际记录了 `--disable-gpu-compositing` 和固定设备缩放，服务端口仍为 20343，登录状态为 true。为消除 Taro React 验收按钮依赖原生默认圆角产生的抗锯齿舍入，`examples/taro-app/src/components/Button.tsx` 为该验收组件显式声明 `borderRadius: 0 !important`，没有改变动态尺寸、颜色、边框或点击断言。

`e2e-artifacts/devtools/2026-10-16T14-05-32.244Z/` 是当前候选的完整 IDE 单轮通过证据：Wevu、Taro React、Taro Vue、Uni 和 native tarball consumer 均完成两次 reLaunch、四次连续切换、状态/class/实际样式恢复及 CLI tap/capture/compare；90 个渲染探针通过，所有截图比较为 0，AppService 异常和应用错误为 0，项目/端点/临时目录清理全部为 true。环境仍是 IDE 2.02.2608080、SDK 3.13.2、iPhone 12/13 Pro、390×753 应用视口。该证据是未提交候选的第一轮，目标要求提交后同一 SHA 再连续通过两轮。

受控诊断中，未固定设备缩放的 `--disable-gpu` 会在 Taro Vue 的两张截图间产生 734→367 尺寸漂移；仅 `--force-color-profile=srgb` 仍有 132 像素差异。因此最终验收必须保留固定设备缩放和禁用 GPU 的官方 IDE 启动条件，并在每轮环境记录中核对实际进程参数；没有改变零像素判定、加入容差或自动重试。

提交后的首次完整验收在消费者声明探针处发现 TypeScript 6 的 `TS5112`（fixture 存在 `tsconfig.json` 时不能同时指定文件列表）。提交 `181552e` 让完整上游声明探针传入 `--ignoreConfig`；随后发现正常消费者类型检查同样需要该显式选项，提交 `779a678` 一并修复。四个 Node/Panda 组合已重新通过，两个修复后的 IDE 单轮也重新通过；最终验收必须在 `779a678` 上重新累计完整串行门禁和两轮 IDE。
