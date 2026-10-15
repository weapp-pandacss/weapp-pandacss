# 全工作区依赖升级评估与验收（2026-10-15）

本次执行已批准的“最新兼容稳定版”方案，覆盖根工具链、两个发布包、Nimbus 文档站和五个活跃示例。历史 `examples/taro-app-linaria` 保留，不参与安装、自动升级或验收。本记录衔接 [2026-10-13 评估](./dependency-review-2026-10-13.md)，旧报告中的版本与审计数字属于当时的历史结果。

## 版本与锁文件

保留原有精确版本、`^`、catalog 和 workspace 写法。由 pnpm 刷新范围内传递依赖并生成完整锁文件，未手工编辑锁文件。

| 范围            | 依赖                            | 升级前     | 本轮采用 |
| --------------- | ------------------------------- | ---------- | -------- |
| 根工具链        | `@playwright/test`              | 1.64.0     | 1.64.1   |
| 根工具链        | execa                           | ^10.1.0    | ^10.1.1  |
| 根工具链        | Turbo                           | ^2.11.7    | ^2.11.8  |
| 环境分类        | `@weapp-tailwindcss/env`        | 0.1.0      | 0.2.0    |
| 真实 IDE 自动化 | miniprogram-automator           | 0.12.1     | 0.13.0   |
| 适配器          | `@weapp-tailwindcss/css-compat` | 0.1.1      | 0.1.2    |
| 根、适配器      | postcss-import                  | 17.0.0     | 17.0.1   |
| React Web       | React / React DOM               | ^19.3.0    | ^19.3.1  |
| Taro Vue        | Vue / compiler-sfc              | ^3.5.43    | ^3.5.44  |
| Wevu            | Vue                             | 3.5.43     | 3.5.44   |
| Uni-app         | weapp-tailwindcss               | ^5.6.1     | ^5.6.3   |
| 文档站          | `@cloudflare/nimbus-docs`       | 0.18.0     | 0.18.1   |
| 文档站          | Wrangler                        | ^4.149.0   | ^4.151.0 |
| Taro React      | `@babel/preset-react`           | 未直接声明 | ^7.29.7  |

最后一项是干净安装暴露的缺失 peer：Taro Babel preset 会使用 React preset，却没有可靠地使它出现在该示例的依赖解析边界内。显式声明 Babel 7 preset 后，普通微信构建通过；repoctl 的 `taro-babel7` 分组和 Renovate `<8` 策略同步涵盖此依赖。

pnpm 12.11.2、repoctl 5.10.3 与 GitHub Actions 已处于本轮稳定基线，未额外修改。发布包版本没有手工递增；通过 `pnpm change` 创建中文 adapter patch 发布意图 `.changeset/clever-bears-trade.md`。

## 安装与 Node 环境

私有根工作区和文档站的 engines 对齐为 `^22.22.3 || ^24.16.0 || >=26.3.0`，满足当前开发工具要求；发布包保留 `^22.18.0 || >=24.11.0`。README、示例说明及双语入门文档区分开发环境和消费者环境，不以开发工具要求抬高发布包的支持下限。实际验收使用 Node 24.21.0。

本机 Corepack 旧入口与 pnpm 12 原生发行布局不兼容。验证已缓存的官方 pnpm 12.11.2 原生程序后，在任务临时目录建立 `pnpm` 入口并前置 PATH，shell、Node spawn、Turbo 和 Playwright 子进程均使用同一版本，没有修改全局 pnpm/Corepack。

先恢复原锁文件安装，再升级和执行 frozen install。完整验证另外发现 `examples/node_modules` 及部分示例 `.bin` 留有 2024 年的 ESLint 9 入口，遮蔽根 ESLint 10。将这些忽略的旧安装产物移到任务临时目录备份，以 `pnpm install --force --offline --frozen-lockfile` 重链接：2910 包全部复用缓存、下载 0，随后验证使用当前依赖。原有未跟踪的两个 `.env.test` 和 `stats/` 保留。

## 兼容实现

SDK 0.13 的 `disconnect()` 返回 Promise。`e2e/devtools/lifecycle.ts` 统一拥有连接，缓存关闭 Promise，正常退出、取消回调和 finally 复用同一次关闭。所有 SDK 请求响应取消；SDK 在断连时清空回调而遗留 pending Promise，也不会阻塞外部清理。连接握手本身同样参与取消竞态：即使握手永不返回也能清理；迟到成功的连接仍释放，迟到拒绝始终有 handler。清理已返回后的断连错误写出诊断并设置失败退出码。

`withCleanup` 按顺序尝试每个清理步骤，保留业务和清理错误，必要时使用 AggregateError。断连失败不会跳过项目关闭、临时目录删除、证据写入和锁释放。截图先取 base64 再写文件，日志启用显式等待 SDK 请求，避免取消后仍由 SDK 内部完成异步副作用。17 项生命周期测试覆盖正常关闭、重复关闭/取消、断连拒绝、连接中取消、永不返回握手、迟到成功/失败以及多步骤清理失败；原有 9 项真实 IDE 前置条件测试保留。

真实多文件 `@import` 回归先导入含 base 层规则及尾部空 overrides 层声明的文件，再导入 overrides 层规则，验证普通声明和 `!important` 的相反优先级。安全回归从 Uni 的实际父包解析 Intlify 和 Express，验证嵌套翻译、原型污染防护、参数/可选参数/通配符路由及恶意长输入；危险正则输入放在带超时的独立进程中。

Nimbus 0.18.1 的官方 `migrate --dry-run --json` 没有 source migration、review item 或 error；审阅后用官方 `migrate --yes --json` 更新基线。`apps/docs/UPSTREAM.md` 保留最初 starter 来源与历次审阅记录。双语 env/importer 版本示例及 Wevu 7.5.0 / Vue 3.5.44 测试组合说明同步。

## 安全补丁与审计对比

保留现有 resolver 补丁、框架 packageExtensions、版本隔离和其余 overrides，仅增加目标明确的兼容补丁：

| override                                    | 依赖链与理由                                                                  |
| ------------------------------------------- | ----------------------------------------------------------------------------- |
| `@intlify/core-base@9.1.9: 9.1.11`          | Uni → uni-cli-shared → core-base；修复 flat JSON 原型污染 High                |
| `@intlify/message-resolver@9.1.10: 9.1.11`  | core-base → message-resolver；与 core-base 兼容，保留已有 9.1.9 → 9.1.11 补丁 |
| `path-to-regexp@0.1.10: 0.1.13`             | Uni → vite-plugin-uni → Express → path-to-regexp；修复两项路由 ReDoS High     |
| `miniprogram-automator@0.13.0>debug: 4.4.3` | SDK 新版固定 debug 4.1.1；局部补丁避免引入旧版本 ReDoS                        |

锁文件和实际父包解析均确认补丁生效：旧 core-base 9.1.9、resolver 9.1.9/9.1.10、path-to-regexp 0.1.10 不再存在于工作区图，目标 SDK 使用 debug 4.4.3。未全局覆盖 Vite、Vue、PostCSS 或 Babel major。

| 严重度   | 升级前 | 最终 | 变化 |
| -------- | -----: | ---: | ---: |
| Critical |      3 |    3 |    0 |
| High     |     22 |   19 |   -3 |
| Moderate |     33 |   33 |    0 |
| Low      |      6 |    6 |    0 |
| 合计     |     64 |   61 |   -3 |

最终审计覆盖 3303 个总依赖记录（升级前 3298），仍以非零状态报告剩余漏洞。按 GHSA、受影响版本与依赖链逐项比较，消除以下三个 High，未新增 GHSA：

- [GHSA-rhx6-c78j-4q9w](https://github.com/advisories/GHSA-rhx6-c78j-4q9w)、[GHSA-37ch-88jc-xwx2](https://github.com/advisories/GHSA-37ch-88jc-xwx2)：Uni 的 Express / path-to-regexp 0.1.x。
- [GHSA-p2ph-7g93-hw3m](https://github.com/advisories/GHSA-p2ph-7g93-hw3m)：Uni 的 Intlify core-base flat JSON 原型污染。

core-base 9.1.11 仍命中 Moderate [GHSA-x8qp-wqqm-57ph](https://github.com/advisories/GHSA-x8qp-wqqm-57ph)，本轮 patch 没有消除该项。剩余三个 Critical 来自 Taro 的 Swiper / decompress；Taro、Uni 固定的旧开发服务器、Vue SSR、序列化和压缩链等风险继续保留，详细风险边界参见上轮报告。微信构建成功不代表 H5 SSR 或对外开发服务没有这些风险。

独立遍历升级前后锁文件的真实依赖图：phin 2.9.3、esbuild 0.20.2/0.21.5、braces 3.0.3 的工作区来源和最短依赖链均未新增，audit 路径数量变化来自枚举顺序/截断。glob 10.2.6 确实从 docs 的 `eslint-plugin-mdx → eslint-mdx → unified-engine` 链消失，但两个 Taro 的 plugin-doctor 链仍保留。发布的 adapter/runtime 工作区依赖图没有命中这些公告。

## 保留项与上游限制

- TypeScript 6.0.3：当前 repoctl peer 不接受 TypeScript 7。
- Panda 2.1.2 三个精确别名：保留最低版本离线消费者测试；默认 Panda cohort 为 2.2.0。
- Taro React 18 / Babel 7，Vue JSX 1.5.0、React refresh 0.14.2：保留框架支持组合；Web 使用 React 19。
- Uni 官方 `3.0.0-5020620260917001` 批次及 Vue 3.4.21、Vite 5.2.8、types 3.4.31：不孤立提升编译器或运行时。
- NutUI React 3.0.20 / Vue 4.3.14：采用正式版，latest 标签指向的 beta/cpp 不作为稳定升级。
- 发布 workflow 的 npm 11.16.0：属于 repoctl 受管模板，当前没有 npm 版本配置入口。npm 12.2.0 已满足新的私有 engines，但直接改受管 workflow 违反本仓库维护约定；整体替换模板还会涉及发布生命周期及 token SHA，本轮记录例外，不以 Node 兼容性作为保留理由。
- 历史 Linaria 示例：保留源码与本地未跟踪文件，继续排除工作区，不将其旧依赖误算为已升级。

`pnpm peers check` 仍返回 1：两个 Taro framework 声明 Vite `^4`，但实际使用 Webpack runner；runner/loader/prebundle 的 Webpack peer 精确固定 5.91.0，实际使用并验证 5.111.1。Wevu 的 Babel 8 与 `babel-plugin-polyfill-corejs3@1.0.0` / helper 的 Babel 7 peer 不同，实际编译与交互另行验证。没有忽略 peer 提示或修改其声明来制造全绿。

## 验证记录

| 检查                                | 实际结果                                                                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| frozen install / 离线 frozen 重链接 | 通过，pnpm 12.11.2                                                                                                                   |
| `pnpm validate`                     | 通过：build → lint → typecheck → tsd → test → test:types                                                                             |
| 完整 Vitest                         | 31 文件，351 测试通过；包含 Panda 2.1.2 / 2.2.0 离线消费者、ESM/CJS 入口和声明、Taro React/Vue 微信及 H5、Uni 微信及 H5 真实构建产物 |
| 四项逐文件覆盖率                    | 100%：statements 371/371，branches 334/334，functions 102/102，lines 341/341；11 个实现文件全覆盖，4 个空入口文件保留，无放宽阈值    |
| `pnpm pack:check`                   | 两个发布包构建及 pack dry-run 通过                                                                                                   |
| `pnpm test:e2e:weapp`               | 3 个构建任务成功，真实 Wevu 编译产物的 2 文件 / 6 项交互与样式测试通过                                                               |
| `pnpm test:e2e:web`                 | Chromium / Firefox / WebKit 三引擎 42 / 42 通过                                                                                      |
| 文档站 `test:e2e`                   | 三引擎 118 通过 / 2 项预期跳过；双语搜索、语言切换、移动导航、存储受阻、复制回退与布局通过                                           |
| `repo doctor`                       | 87 pass / 59 warn / 0 fail；保留模板差异等既有提示                                                                                   |
| `repo check`                        | 通过默认轻量检查；当前无 staged 文件，完整源码验收由 validate 覆盖                                                                   |
| `repo deps check`                   | 146 consistent / 2 managed / 3 exception / 0 conflict                                                                                |
| `repo deps catalog check`           | missing / unused / uncomparable / direct 均为 0；141 ready                                                                           |
| `pnpm change check`                 | 1 个发布意图解析正确，版本约束通过                                                                                                   |
| 文档站                              | 54 页面构建、40 文件类型检查零错误/警告/提示、27 对双语页面及可执行示例检查通过                                                      |
| Nimbus 五个 scope                   | 全部通过，readiness 为 buildable，0 error / warning / note                                                                           |
| discovery / headers                 | 54 HTML / 108 导出，双向 hreflang、sitemap/robots、ARD/AI catalogue、llms/Pagefind、9 条 CORS/Link/UTF-8 headers 规则通过            |
| Wrangler `deploy:check`             | 部署 dry-run 通过，316 assets；未执行部署                                                                                            |

文档站仅有真实系统剪贴板权限用例按原有设计在 Firefox / WebKit 跳过；Chromium 执行真实剪贴板检查，三个引擎都执行复制与权限受阻回退检查。没有为升级新增 skip、重试或放宽断言。

lint 保留 Taro React 和 Uni 原有共 6 条 console warning，无错误。`repo doctor` 和 peer 检查的提示已记录，不将退出成功表述为完全没有警告。

doctor 的模板版本/文件差异提示来自保留的来源记录和本地适配；其 `lockfile-sync` 无法证明 `postcss-selector-parser` override 的转换规则，因而也给出 `installation-state` 提示。实际 manifest/lockfile 可安装性以已通过的 frozen install 验证，未改动受管配置来隐藏提示。

安装与 Playwright 1.64.1 匹配的官方浏览器：Chromium / Headless Shell 156.0.8078.4（revision 1248）、Firefox 157.0（1555）、WebKit 27.2（2370），以及 FFmpeg 1013。网络中断通过任务临时缓存断点续传，完成 ZIP 校验后由官方 CLI 安装，未替换修订版本。本机 Firefox 在处理 profile 参数前的默认应用/缓存数据路径初始化阶段失败；仅在验收进程内将 `MOZ_APP_DATA`、`MOZ_LOCAL_APP_DATA` 指向已创建的任务临时目录，浏览器启动通过，没有更改全局 profile 或仓库配置。

真实 IDE E2E 未执行：`WEAPP_VITE_E2E_DEVTOOLS_CLI_PATH`、`WEAPP_VITE_E2E_APPID`、`WEAPP_VITE_E2E_DEVTOOLS_STABLE_VERSION`、`WEAPP_VITE_E2E_DEVTOOLS_INSTALLED_VERSION`、`WEAPP_VITE_E2E_DEVTOOLS_CHECKED_AT` 五项环境变量均未配置。需要获授权的真实 AppID 和在 24 小时内核验的官方稳定 IDE 版本。模拟生命周期测试和 Wevu 编译产物交互不替代真实 IDE/像素验收。

本机日志与原始审计保存在 `/tmp/weapp-pandacss-upgrade-20261015-F3VK7O/`；本文件保存审计变化和验收结论，便于脱离临时日志审阅。没有发布包或部署站点。

## 逐项公告对照

审计 advisory 对照（64 → 61；High 22 → 19，Critical 3、Moderate 33、Low 6 均不变）。未新增 advisory ID。下表按 GHSA 逐项列出全部 64 条，工作区来源由升级前后的锁文件 dependency graph 核对，不以 audit 的有界路径列表数量作为新增风险证据。

`root` = 工作区根工具依赖，`docs` = apps/docs，`Taro React` / `Taro Vue` / `Uni` / `weapp-vite` = 对应 examples 工作区；`adapter` / `runtime` = 发布包工作区。表中仅列受该 advisory 影响的版本；“—”表示该 advisory 的受影响版本已移除，不表示整个模块已移除。

| GHSA                                                                     | 严重性   | 模块                     | 升级前受影响版本 | 升级后受影响版本 | 工作区来源（前 → 后）                             | 变化                             |
| ------------------------------------------------------------------------ | -------- | ------------------------ | ---------------- | ---------------- | ------------------------------------------------- | -------------------------------- |
| [GHSA-hrh2-vp3x-79xf](https://github.com/advisories/GHSA-hrh2-vp3x-79xf) | critical | `decompress`             | 4.2.1            | 4.2.1            | Taro React, Taro Vue                              | 保留                             |
| [GHSA-mp2f-45pm-3cg9](https://github.com/advisories/GHSA-mp2f-45pm-3cg9) | critical | `decompress`             | 4.2.1            | 4.2.1            | Taro React, Taro Vue                              | 保留                             |
| [GHSA-hmx5-qpq5-p643](https://github.com/advisories/GHSA-hmx5-qpq5-p643) | critical | `swiper`                 | 11.1.15          | 11.1.15          | Taro React, Taro Vue                              | 保留                             |
| [GHSA-p2ph-7g93-hw3m](https://github.com/advisories/GHSA-p2ph-7g93-hw3m) | high     | `@intlify/core-base`     | 9.1.9            | —                | Uni → —                                           | 移除该 advisory                  |
| [GHSA-g2v6-rqmx-r4w6](https://github.com/advisories/GHSA-g2v6-rqmx-r4w6) | high     | `@vue/server-renderer`   | 3.4.21           | 3.4.21           | Uni                                               | 保留                             |
| [GHSA-7q85-xj36-vmfc](https://github.com/advisories/GHSA-7q85-xj36-vmfc) | high     | `adm-zip`                | 0.5.16, 0.5.18   | 0.5.16, 0.5.18   | Taro React, Taro Vue, Uni                         | 保留                             |
| [GHSA-8238-w5pm-2374](https://github.com/advisories/GHSA-8238-w5pm-2374) | high     | `adm-zip`                | 0.5.16, 0.5.18   | 0.5.16, 0.5.18   | Taro React, Taro Vue, Uni                         | 保留                             |
| [GHSA-j5f4-cc29-5x44](https://github.com/advisories/GHSA-j5f4-cc29-5x44) | high     | `adm-zip`                | 0.5.16, 0.5.18   | 0.5.16, 0.5.18   | Taro React, Taro Vue, Uni                         | 保留                             |
| [GHSA-rcw4-f5rp-g42v](https://github.com/advisories/GHSA-rcw4-f5rp-g42v) | high     | `adm-zip`                | 0.5.16, 0.5.18   | 0.5.16, 0.5.18   | Taro React, Taro Vue, Uni                         | 保留                             |
| [GHSA-xcpc-8h2w-3j85](https://github.com/advisories/GHSA-xcpc-8h2w-3j85) | high     | `adm-zip`                | 0.5.16, 0.5.18   | 0.5.16, 0.5.18   | Taro React, Taro Vue, Uni                         | 保留                             |
| [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | high     | `braces`                 | 3.0.3            | 3.0.3            | root, Taro React, Taro Vue, Uni, weapp-vite       | 既有版本/根来源；路径枚举调整    |
| [GHSA-8jmw-wjr8-2x66](https://github.com/advisories/GHSA-8jmw-wjr8-2x66) | high     | `git-clone`              | 0.1.0            | 0.1.0            | Taro React, Taro Vue                              | 保留                             |
| [GHSA-5j98-mcp5-4vw2](https://github.com/advisories/GHSA-5j98-mcp5-4vw2) | high     | `glob`                   | 10.2.6           | 10.2.6           | docs, Taro React, Taro Vue → Taro React, Taro Vue | 移除 docs 链；Taro 保留          |
| [GHSA-pfq8-rq6v-vf5m](https://github.com/advisories/GHSA-pfq8-rq6v-vf5m) | high     | `html-minifier`          | 4.0.0            | 4.0.0            | Taro React, Taro Vue                              | 保留                             |
| [GHSA-ch52-4w7c-c8xp](https://github.com/advisories/GHSA-ch52-4w7c-c8xp) | high     | `http-cache-semantics`   | 3.8.1            | 3.8.1            | Taro React, Taro Vue                              | 保留                             |
| [GHSA-rc47-6667-2j5j](https://github.com/advisories/GHSA-rc47-6667-2j5j) | high     | `http-cache-semantics`   | 3.8.1            | 3.8.1            | Taro React, Taro Vue                              | 保留                             |
| [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) | high     | `node-forge`             | 1.4.0            | 1.4.0            | Taro React, Taro Vue                              | 保留                             |
| [GHSA-37ch-88jc-xwx2](https://github.com/advisories/GHSA-37ch-88jc-xwx2) | high     | `path-to-regexp`         | 0.1.10           | —                | Uni → —                                           | 移除该 advisory                  |
| [GHSA-rhx6-c78j-4q9w](https://github.com/advisories/GHSA-rhx6-c78j-4q9w) | high     | `path-to-regexp`         | 0.1.10           | —                | Uni → —                                           | 移除该 advisory                  |
| [GHSA-6g55-p6wh-862q](https://github.com/advisories/GHSA-6g55-p6wh-862q) | high     | `postcss`                | 7.0.39           | 7.0.39           | Taro React, Taro Vue                              | 保留                             |
| [GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849) | high     | `postcss`                | 7.0.39           | 7.0.39           | Taro React, Taro Vue                              | 保留                             |
| [GHSA-5c6j-r48x-rmvq](https://github.com/advisories/GHSA-5c6j-r48x-rmvq) | high     | `serialize-javascript`   | 6.0.2            | 6.0.2            | Taro React, Taro Vue                              | 保留                             |
| [GHSA-c27g-q93r-2cwf](https://github.com/advisories/GHSA-c27g-q93r-2cwf) | high     | `vite`                   | 5.2.8            | 5.2.8            | Uni                                               | 保留                             |
| [GHSA-fx2h-pf6j-xcff](https://github.com/advisories/GHSA-fx2h-pf6j-xcff) | high     | `vite`                   | 5.2.8            | 5.2.8            | Uni                                               | 保留                             |
| [GHSA-g84c-rxfj-3j2c](https://github.com/advisories/GHSA-g84c-rxfj-3j2c) | high     | `webpack-dev-middleware` | 5.3.4            | 5.3.4            | Taro React, Taro Vue                              | 保留                             |
| [GHSA-x8qp-wqqm-57ph](https://github.com/advisories/GHSA-x8qp-wqqm-57ph) | moderate | `@intlify/core-base`     | 9.1.9            | 9.1.11           | Uni                                               | 升级后仍受既有 XSS advisory 影响 |
| [GHSA-c6fg-446q-cg94](https://github.com/advisories/GHSA-c6fg-446q-cg94) | moderate | `adm-zip`                | 0.5.16, 0.5.18   | 0.5.16, 0.5.18   | Taro React, Taro Vue, Uni                         | 保留                             |
| [GHSA-p634-w6r4-rjp2](https://github.com/advisories/GHSA-p634-w6r4-rjp2) | moderate | `adm-zip`                | 0.5.16, 0.5.18   | 0.5.16, 0.5.18   | Taro React, Taro Vue, Uni                         | 保留                             |
| [GHSA-vwc7-r8mq-g2x9](https://github.com/advisories/GHSA-vwc7-r8mq-g2x9) | moderate | `adm-zip`                | 0.5.16, 0.5.18   | 0.5.16, 0.5.18   | Taro React, Taro Vue, Uni                         | 保留                             |
| [GHSA-vcc3-ghjq-m6fr](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr) | moderate | `decode-uri-component`   | 0.2.2            | 0.2.2            | Taro React, Taro Vue                              | 保留                             |
| [GHSA-h39j-r5qq-r9mm](https://github.com/advisories/GHSA-h39j-r5qq-r9mm) | moderate | `decompress`             | 4.2.1            | 4.2.1            | Taro React, Taro Vue                              | 保留                             |
| [GHSA-jwp9-9v96-94mx](https://github.com/advisories/GHSA-jwp9-9v96-94mx) | moderate | `decompress`             | 4.2.1            | 4.2.1            | Taro React, Taro Vue                              | 保留                             |
| [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99) | moderate | `esbuild`                | 0.20.2, 0.21.5   | 0.20.2, 0.21.5   | Taro React, Taro Vue, Uni                         | 既有版本/根来源；路径枚举调整    |
| [GHSA-pfrx-2q88-qq97](https://github.com/advisories/GHSA-pfrx-2q88-qq97) | moderate | `got`                    | 8.3.2, 9.6.0     | 8.3.2, 9.6.0     | Taro React, Taro Vue                              | 保留                             |
| [GHSA-x565-32qp-m3vf](https://github.com/advisories/GHSA-x565-32qp-m3vf) | moderate | `phin`                   | 2.9.3            | 2.9.3            | root, Uni                                         | 既有版本/根来源；路径枚举调整    |
| [GHSA-7fh5-64p2-3v2j](https://github.com/advisories/GHSA-7fh5-64p2-3v2j) | moderate | `postcss`                | 7.0.39           | 7.0.39           | Taro React, Taro Vue                              | 保留                             |
| [GHSA-fxqj-rqcc-2cmp](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp) | moderate | `postcss`                | 7.0.39           | 7.0.39           | Taro React, Taro Vue                              | 保留                             |
| [GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93) | moderate | `postcss`                | 7.0.39           | 7.0.39           | Taro React, Taro Vue                              | 保留                             |
| [GHSA-qj8w-gfj5-8c6v](https://github.com/advisories/GHSA-qj8w-gfj5-8c6v) | moderate | `serialize-javascript`   | 6.0.2            | 6.0.2            | Taro React, Taro Vue                              | 保留                             |
| [GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c) | moderate | `sprintf-js`             | 1.0.3            | 1.0.3            | Uni                                               | 保留                             |
| [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) | moderate | `uuid`                   | 8.3.2            | 8.3.2            | Taro React, Taro Vue                              | 保留                             |
| [GHSA-356w-63v5-8wf4](https://github.com/advisories/GHSA-356w-63v5-8wf4) | moderate | `vite`                   | 5.2.8            | 5.2.8            | Uni                                               | 保留                             |
| [GHSA-4r4m-qw57-chr8](https://github.com/advisories/GHSA-4r4m-qw57-chr8) | moderate | `vite`                   | 5.2.8            | 5.2.8            | Uni                                               | 保留                             |
| [GHSA-4w7w-66w2-5vf9](https://github.com/advisories/GHSA-4w7w-66w2-5vf9) | moderate | `vite`                   | 5.2.8            | 5.2.8            | Uni                                               | 保留                             |
| [GHSA-64vr-g452-qvp3](https://github.com/advisories/GHSA-64vr-g452-qvp3) | moderate | `vite`                   | 5.2.8            | 5.2.8            | Uni                                               | 保留                             |
| [GHSA-859w-5945-r5v3](https://github.com/advisories/GHSA-859w-5945-r5v3) | moderate | `vite`                   | 5.2.8            | 5.2.8            | Uni                                               | 保留                             |
| [GHSA-93m4-6634-74q7](https://github.com/advisories/GHSA-93m4-6634-74q7) | moderate | `vite`                   | 5.2.8            | 5.2.8            | Uni                                               | 保留                             |
| [GHSA-9cwx-2883-4wfx](https://github.com/advisories/GHSA-9cwx-2883-4wfx) | moderate | `vite`                   | 5.2.8            | 5.2.8            | Uni                                               | 保留                             |
| [GHSA-v6wh-96g9-6wx3](https://github.com/advisories/GHSA-v6wh-96g9-6wx3) | moderate | `vite`                   | 5.2.8            | 5.2.8            | Uni                                               | 保留                             |
| [GHSA-vg6x-rcgg-rjx6](https://github.com/advisories/GHSA-vg6x-rcgg-rjx6) | moderate | `vite`                   | 5.2.8            | 5.2.8            | Uni                                               | 保留                             |
| [GHSA-x574-m823-4x7w](https://github.com/advisories/GHSA-x574-m823-4x7w) | moderate | `vite`                   | 5.2.8            | 5.2.8            | Uni                                               | 保留                             |
| [GHSA-xcj6-pq6g-qj4x](https://github.com/advisories/GHSA-xcj6-pq6g-qj4x) | moderate | `vite`                   | 5.2.8            | 5.2.8            | Uni                                               | 保留                             |
| [GHSA-4v9v-hfq4-rm2v](https://github.com/advisories/GHSA-4v9v-hfq4-rm2v) | moderate | `webpack-dev-server`     | 4.15.2           | 4.15.2           | Taro React, Taro Vue                              | 保留                             |
| [GHSA-79cf-xcqc-c78w](https://github.com/advisories/GHSA-79cf-xcqc-c78w) | moderate | `webpack-dev-server`     | 4.15.2           | 4.15.2           | Taro React, Taro Vue                              | 保留                             |
| [GHSA-9jgg-88mc-972h](https://github.com/advisories/GHSA-9jgg-88mc-972h) | moderate | `webpack-dev-server`     | 4.15.2           | 4.15.2           | Taro React, Taro Vue                              | 保留                             |
| [GHSA-f5vj-f2hx-8m93](https://github.com/advisories/GHSA-f5vj-f2hx-8m93) | moderate | `webpack-dev-server`     | 4.15.2           | 4.15.2           | Taro React, Taro Vue                              | 保留                             |
| [GHSA-m28w-2pqf-7qgj](https://github.com/advisories/GHSA-m28w-2pqf-7qgj) | moderate | `webpack-dev-server`     | 4.15.2           | 4.15.2           | Taro React, Taro Vue                              | 保留                             |
| [GHSA-mx8g-39q3-5c79](https://github.com/advisories/GHSA-mx8g-39q3-5c79) | moderate | `webpack-dev-server`     | 4.15.2           | 4.15.2           | Taro React, Taro Vue                              | 保留                             |
| [GHSA-vpq2-c234-7xj6](https://github.com/advisories/GHSA-vpq2-c234-7xj6) | low      | `@tootallnate/once`      | 1.1.2            | 1.1.2            | Uni                                               | 保留                             |
| [GHSA-pxg6-pf52-xh8x](https://github.com/advisories/GHSA-pxg6-pf52-xh8x) | low      | `cookie`                 | 0.6.0            | 0.6.0            | Uni                                               | 保留                             |
| [GHSA-238p-pmpm-9mq7](https://github.com/advisories/GHSA-238p-pmpm-9mq7) | low      | `katex`                  | 0.16.47          | 0.16.47          | root                                              | 保留                             |
| [GHSA-m6fv-jmcg-4jfg](https://github.com/advisories/GHSA-m6fv-jmcg-4jfg) | low      | `send`                   | 0.18.0           | 0.18.0           | Uni                                               | 保留                             |
| [GHSA-g4jq-h2w9-997c](https://github.com/advisories/GHSA-g4jq-h2w9-997c) | low      | `vite`                   | 5.2.8            | 5.2.8            | Uni                                               | 保留                             |
| [GHSA-jqfw-vq24-v9c3](https://github.com/advisories/GHSA-jqfw-vq24-v9c3) | low      | `vite`                   | 5.2.8            | 5.2.8            | Uni                                               | 保留                             |
