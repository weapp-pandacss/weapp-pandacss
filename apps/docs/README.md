# weapp-pandacss documentation / 双语文档

Stable site: <https://panda.weapp.dev/>. Main-branch preview: <https://preview.panda.weapp.dev/>.
English lives at `/`, Chinese at `/zh/` in both channels.
本站基于 `repo new docs --template nimbus` 创建，保留 Nimbus、Astro 与模板上游说明。

## Content structure / 内容结构

The site separates setup, framework integration, scenario guides and API reference. Existing
`/get-started/`, `/panda/`, `/postcss/`, `/runtime/`, `/frameworks/`, `/api/`, `/migration/`
and `/troubleshooting/` routes remain valid; detailed pages extend them:

| Content | Routes | Authoring purpose |
| --- | --- | --- |
| Setup | `/get-started/` and configuration overviews | Minimal complete pipeline and compatibility baseline |
| Frameworks | `/frameworks/` and `/frameworks/*/` | Weapp Vite, Taro React/Vue, Uni-app, Web and a clearly labeled native recipe |
| Scenarios | `/guides/` and `/guides/*/` | Dynamic styles, class naming, components, target isolation and CSS boundaries |
| API | `/api/` and `/api/*/` | Package entries, exact adapter signatures/options and supported Panda-generated APIs |
| Maintenance | `/migration/`, `/troubleshooting/` | Upgrade recovery, diagnostic steps and issue reproduction |

Each route has the equivalent `/zh/` route. Keep API defaults and examples grounded in
`packages/*/src` and the active examples; distinguish artifact, headless, browser, IDE and
physical-device verification. Do not infer platform support from a framework script or
present the native recipe as independently E2E-tested.

文档按接入、框架、场景与 API 分层，保留原有入口，每个英文页面都有对应中文路由。
参数与示例以实际源码为准，明确区分产物、headless、浏览器、IDE 和真机验证，
不能用已有构建脚本代替平台验收。

## Development / 开发

Install dependencies at the monorepo root, then run:

```sh
pnpm --filter @weapp-pandacss/docs dev
pnpm --filter @weapp-pandacss/docs build
pnpm --filter @weapp-pandacss/docs preview
pnpm --filter @weapp-pandacss/docs lint
pnpm --filter @weapp-pandacss/docs typecheck
pnpm --filter @weapp-pandacss/docs test:e2e
pnpm docs:test:e2e
```

Local development and builds default to the preview channel. The package's `test:e2e`
checks the current channel; the root `docs:test:e2e` builds and tests preview and stable
in sequence. `REPO_DOCS_CHANNEL=stable` selects a local stable build. `REPO_DOCS_URL`,
when supplied, must match that channel's domain; inconsistent values fail the build.

本地开发与构建默认使用预览频道。根目录 `pnpm docs:test:e2e` 依次构建并验证预览、正式两种产物。
`REPO_DOCS_CHANNEL=stable` 可在本地验证正式版构建；指定 `REPO_DOCS_URL` 时必须与频道域名一致。

Content lives in `src/content/docs/`; each English page must have a matching filename under `zh/`.
`check:locales` runs before every build. Pagefind indexes both languages during the production build;
use `preview` to test search. Logo files in `public/` come from `assets/brand` at the repository root.

内容位于 `src/content/docs/`，中文在 `zh/` 下保留同名文件。构建前检查翻译覆盖，
生产构建生成双语 Pagefind 搜索索引，使用 `preview` 验证搜索。

Machine-readable routes: `/llms.txt`, `/zh/llms.txt`, `/llms-full.txt`, and each page's `/index.md` and `/index.mdx`.
Canonical URLs, language metadata, sitemaps and machine-readable indexes use the selected
channel's domain. Preview HTML displays a translated notice linking to the same stable page,
sets `noindex, nofollow`, and disallows crawling in `robots.txt`. The generated Cloudflare
`_headers` applies `X-Robots-Tag: noindex, nofollow` to all preview assets, including text exports.
Stable builds remove that preview policy. Site search remains available in both channels.

Nimbus's `/_nimbus/shiki.css` defines token color variables; `src/styles/code.css`
applies them to the selected light/dark theme. Check system, explicit light and explicit dark
preferences when changing code styles. Keep keyboard focus and reduced-motion behavior
usable when changing navigation, search or code-copy interactions.

## Validation before delivery / 交付前验证

Run from the monorepo root with its declared Node/pnpm version:

```sh
pnpm --filter @weapp-pandacss/docs check:locales
pnpm --filter @weapp-pandacss/docs lint
pnpm --filter @weapp-pandacss/docs typecheck
pnpm --filter @weapp-pandacss/docs build
pnpm exec turbo run build --filter=weapp-pandacss
pnpm --filter @weapp-pandacss/docs check:examples
pnpm --filter @weapp-pandacss/docs deploy:check
pnpm --filter @weapp-pandacss/docs test:e2e
pnpm docs:test:e2e
pnpm lint
pnpm typecheck
```

`check:examples` executes the homepage example with Panda 2.2.0 and checks runtime/CSS
matching in a temporary fixture; it does not validate every framework or every snippet.
The adapter build includes its standalone runtime dependency. Root lint/typecheck are also
the repository's pre-push gates. Browser checks use the built site, run headlessly and own
their preview server; avoid overlapping builds or manually started servers on test ports.

`deploy:check` builds both channels, checks their discovery metadata and generated headers,
and runs Wrangler with `--dry-run` for each matching Worker. It never uploads a deployment.
The browser runner also checks this metadata for both channels before opening the site.

After a production build, use `preview` to check English/Chinese search, existing and new
routes, desktop/mobile navigation, theme contrast and readable code/tables. Verify that
language switches retain the current page and that page metadata refers to its translation.
Inspect `/llms.txt`, `/zh/llms.txt`, `/llms-full.txt` and the new pages' `/index.md` and
`/index.mdx`; important content must remain present without interactive controls.

New MDX components belong in `src/components.ts`; information-bearing components also
need a Markdown conversion in `src/lib/markdown-components.ts`. Keep authored styles under `src/styles/`.
Translation parity and Nimbus link checks are required before publishing a new page.

首页示例由 `check:examples` 实际执行，完整站点在生产构建后验收搜索和交互。
新增页面同时检查语言切换、机器可读内容与移动阅读；根目录 lint/typecheck 也是
pre-push 门禁。测试后台运行并管理自己的预览服务，避免与其他构建或端口冲突。

## Automatic language / 自动语言选择

On `/`, the browser checks its time zone and preferred language locally. Mainland China,
Hong Kong, Macau and Taiwan time zones, or a primary Chinese browser language, open `/zh/`;
other clients keep the English homepage. These signals infer a preference rather than
identify the visitor's IP location. No locale API, geolocation service or Worker execution
is used. Explicit `?lang=en` / `?lang=zh` and remembered manual language switches take
priority. Deep links keep their selected language.

访问 `/` 时，浏览器在本地检查时区和首选语言。大陆及港澳台时区，或中文首选语言，
自动进入 `/zh/`，其他客户端保留英文。这些信号用于推断语言偏好，不能准确识别 IP 所在地区。
检测不请求接口或定位服务，也不执行 Worker。手动切换会记住选择，
`?lang=en` / `?lang=zh` 可显式指定语言；深层链接不自动跳转。
本地静态预览和生产站点使用相同逻辑。

`test:e2e` builds the site and tests client time zones, browser languages, manual
switches, storage restrictions and the absence of locale API requests in Chromium,
Firefox and WebKit.

## Deployment / 部署

repoctl manages the `website` site through `.github/workflows/repoctl-docs.yml`
(`Documentation`) and its reusable deployment workflow. A main-branch push updates the
preview site. Stable deployment follows a completed stable package release and builds its
recorded source commit. Nightly npm releases use the managed release workflow and do not
promote preview documentation to stable.

| Channel | Source | Cloudflare service | Domain | GitHub environment |
| --- | --- | --- | --- | --- |
| Preview | Latest committed `main` | `weapp-pandacss-docs-preview` | `preview.panda.weapp.dev` | `docs-website-preview` |
| Stable | Completed stable release | `weapp-pandacss-docs` | `panda.weapp.dev` | `docs-website-stable` |

Both services publish static assets without a Worker `main`, an `ASSETS` binding or
`run_worker_first`. Unknown routes, including `/api/locale`, return HTTP 404. Wrangler manages
the custom domains and HTTPS certificates. Static asset billing follows
[Cloudflare's published policy](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/).

Before enabling CI deployments, configure `CLOUDFLARE_API_TOKEN` as a GitHub Actions secret
and `CLOUDFLARE_ACCOUNT_ID` as a secret or variable available to the two environments. The token
must be able to deploy Workers static assets and manage the custom domains in the `weapp.dev`
zone. Restrict both environments to the `main` branch. Local Wrangler OAuth credentials are
not CI credentials. npm trusted publishing must authorize the repository's managed `release.yml` workflow
for both published packages; no separate nightly workflow is needed.

Inspect a deployment plan from the monorepo root with GitHub repository access available:

```sh
export GITHUB_REPOSITORY=weapp-pandacss/weapp-pandacss
export GITHUB_TOKEN="$(gh auth token)"
pnpm exec repo docs plan website --channel preview --source-sha <full-main-sha> --json
pnpm exec repo docs plan website --channel stable --release <completed-release-id> --json
```

These commands only inspect publication state. Before the first complete release managed
by repoctl 6, stable planning reports that no baseline exists; the current live site remains
in place until that release supplies its completion record. Nightly dry-runs also belong
in the Release workflow because their identity requires a real GitHub Actions run.

For a manual deployment, run the `Documentation` workflow with `site=website` and the desired
`channel`. Supply `source-sha` for preview or `release` for stable. Its optional `commits`
input accepts space-separated, single-parent, documentation-only commits already merged
into main when a stable documentation correction is required. repoctl validates the sources
and builds them in isolation. Stable publication is guarded by the managed GitHub workflow;
do not invoke Wrangler directly or publish a local working tree as stable. The build records
its channel and source in `dist/docs-build.json` for deployment verification.

预览站随 `main` 的已提交代码更新；正式站仅使用已完成正式发布的源码，nightly 不会推动正式文档上线。
手动部署从 GitHub Actions 的 `Documentation` 工作流进入，填写 `site=website`、`channel`，
再按频道填写完整 `source-sha` 或已完成发布的 `release` 标识。正式文档修正可使用 `commits`
追加已经合并到 main 的纯文档提交，repoctl 会检查来源并在隔离目录构建。
生产部署必须经过受管工作流，包内不再提供直接 Wrangler 部署脚本。

If deployment fails, fix the reported credential, build or provider error and rerun the
`Documentation` workflow with the same site, channel, source/release and correction commits.
Keep the stable release record and repoctl deployment state intact; do not initialize a
missing stable baseline from an arbitrary main commit. If an upload succeeded but its
response was lost, the adapter checks the active Cloudflare version's deployment identity
and 100% traffic allocation, then restores the receipt without uploading again. A changed
identity or unconfirmed active version cannot reuse that receipt. The provider result is
written to `REPO_DOCS_RESULT_FILE` for repoctl to record.

部署失败后先修复日志中的原因，再用原频道、源码/发布记录及文档修正提交重试。
上传成功但响应丢失时，适配器核对 Cloudflare 当前生效版本后恢复结果；不要手工修改
发布账本或用任意 main 提交补正式基线。

本站为 private 工作区；仅修改本站与根目录/示例说明不需要编造包版本。
已发布包目录内的改动，包括 README，仍需要 `pnpm change` 记录 release intent。
构建产物、Wrangler 状态与本地凭证不提交到仓库。

See `AGENTS.md`, `nimbus.json` and `UPSTREAM.md` for the template's maintenance contract.
