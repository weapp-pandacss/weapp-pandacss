# 2026-10-09 依赖复核

复核根工具链、发布包、Nimbus 文档、五个活跃示例、pnpm 和 GitHub Actions。
以 npm 正式发行和上游 peer 声明为依据；历史 Linaria 示例仍归档。
`pnpm outdated -r --include-workspace-root --include-github-actions --format json`
提供候选清单，再逐项核对发行说明及框架版本组合。

## 采用的升级

| 依赖                             | 原版本 | 新版本  | 评估结果                                                                                      |
| -------------------------------- | ------ | ------- | --------------------------------------------------------------------------------------------- |
| pnpm                             | 12.9.1 | 12.10.1 | 同主版本稳定更新，修复 override 与 filtered frozen install；由 Corepack 更新并记录完整性 hash |
| `@cloudflare/nimbus-docs`        | 0.16.0 | 0.17.0  | Astro peer 仍为 `>=7.2.6 <8`；审阅生成路由、collection 和 API 迁移要求                        |
| Astro                            | 7.3.7  | 7.3.8   | 稳定补丁，满足 Nimbus 和现有 Node 版本要求                                                    |
| React 示例 Vite                  | 8.3.3  | 8.3.4   | 稳定补丁，React 插件 6.1.2 保持兼容；不修改 Uni-app 的 Vite                                   |
| Uni-app 示例 `weapp-tailwindcss` | 5.5.12 | 5.6.0   | Vite 5.2.8 / Tailwind 4 均在 peer 范围；原生实验内核默认关闭，保留现有插件配置                |

Weapp Vite 示例另显式声明 `@babel/core@^8.0.7`，为其 Babel 8 presets
提供正确的 core，避免从 Taro 的 Babel 7 工具链解析。Taro 的 core 仍为
7.29.7；两套编译器分别在自己的工作区解析，不设置全局 Babel override。

## 保留的版本

| 范围                                                                  | 保留原因                                                                                 |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| repoctl 5.9.0、Panda 2.1.2、Taro 4.3.0、Weapp Vite/Wevu 7.4.0、mpcore | 已是本次查询的稳定基线                                                                   |
| TypeScript 6.0.3                                                      | repoctl 的 peer 支持 5/6，最新的 7.0.2 超出范围                                          |
| Taro React 18、Babel 7                                                | framework/preset 的显式 peer 要求；React Web 独立使用 19                                 |
| Taro `@vue/babel-plugin-jsx` 1.5.0、react-refresh 0.14.2              | Taro preset 声明 `^1.2.2` 和 `^0.14.0`；JSX 2 即使支持 Babel 7，也超出 Taro 的 peer 范围 |
| Uni-app Vue 3.4.21、Vite 5.2.8                                        | 与官方 `3.0.0-5020620260917001` 编译器批次配套，不单独提升框架运行时                     |
| `@dcloudio/types` 3.4.31                                              | 试装 3.4.32 后确认该批次的 `uni-app` peer 固定为 3.4.31，因此保留旧版本                  |
| NutUI                                                                 | `latest` 分别指向 cpp / beta，仍使用稳定的 3.0.20 / 4.3.14                               |
| DCloud `latest` 的旧 alpha                                            | 部分标签比已安装的官方数字批次更旧，不按标签回退                                         |
| GitHub Actions                                                        | 本次检查未发现新版本；保留三系统 × Node 22/24 和已有 SHA 固定方式                        |

## Nimbus 0.17 审阅

现有 `docs` 使用 `docsCollection()`，输出为静态站点，没有 OpenAPI
collections、项目本地 `skills/` 或冲突的 `.well-known` 路由。
13 项升级审阅没有产生必要的源码迁移。通过官方
`nimbus-docs migrate --yes --json` 将审阅基线记录为 0.17.0。
原始模板 tag 和初始版本继续作为来源记录，不冒充已同步最新 starter。

检查框架新生成的 agent discovery 文档及 Link headers，同时保留现有 robots
策略、双语路由和自有布局。WebMCP、API 版本查询模式与上游 sidebar 模板均
为可选功能，本次不引入。Shiki 颜色样式仍由项目维护。

## Peer 与安全审计

Weapp Vite 的 Babel 8 preset peer 冲突从 71 处降至 2 处。剩余两处来自
`babel-plugin-polyfill-corejs3` / `@babel/helper-define-polyfill-provider`
仍声明 Babel 7 的元数据。使用实际解析的 Babel 8 执行 TypeScript、preset-env
和 polyfill 转换，确认生成 `flat` / `Promise` 的 core-js imports；同时检查
Taro 仍解析 Babel 7。其它 upstream peer 提示见原依赖升级记录。

## 验证结果

- `pnpm build → pnpm lint → pnpm typecheck → pnpm tsd → pnpm test` 全部通过；
  13 个测试文件、58 个测试通过。另关闭 Turbo 缓存重建，七个 workspace
  构建全部通过，包含发布包、五个示例和文档。
- `pnpm pack:check`、pnpm 12.10.1 的 frozen install 通过。
- `repo deps check` 为 132 consistent、0 conflict；`repo doctor` 为
  92 pass、42 warn、0 fail，未隐去模板与 upstream 诊断。
- 完成类型检查后重新构建文档，`nimbus-docs check --json` 为
  passed / buildable，0 errors / warnings / notes；迁移审阅状态为 passed。
- 浏览器核对 18 个中英文页面、38 个代码块及每主题 522 个 token，
  深浅主题的颜色和背景一致。双语搜索各返回 9 页，语言切换保持当前页；
  375px 布局无横向溢出，无页面异常或失败请求。
- 新 discovery JSON、Markdown/LLM 路由、核心域名和 `_headers` 校验通过，
  robots 内容保持原样。

## 审计结果

本次审计前后的告警均为 low 6、moderate 33、high 24、critical 5，未新增。
告警仍主要来自框架固定的旧传递依赖；没有用全局 major override 替换框架
编译器，也没有调整 CI 的审计失败策略。原有告警详情见
[依赖升级记录](dependency-upgrade.md)。

版本来源：

- [pnpm 12.10.1](https://github.com/pnpm/pnpm/releases/tag/v12.10.1)
- [Nimbus 0.17.0](https://github.com/cloudflare/nimbus/releases/tag/%40cloudflare/nimbus-docs%400.17.0)
- [weapp-tailwindcss 5.6.0](https://github.com/weapp-tailwindcss/weapp-tailwindcss/releases/tag/weapp-tailwindcss%405.6.0)
- [Uni-app 官方模板](https://github.com/dcloudio/uni-preset-vue/blob/vite/package.json)
