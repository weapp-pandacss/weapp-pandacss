# weapp-pandacss documentation / 双语文档

Canonical site: <https://panda.weapp.dev/>. English lives at `/`, Chinese at `/zh/`.
本站基于 `repo new docs --template nimbus` 创建，保留 Nimbus、Astro 与模板上游说明。

## Development / 开发

Install dependencies at the monorepo root, then run:

```sh
pnpm --filter @weapp-pandacss/docs dev
pnpm --filter @weapp-pandacss/docs build
pnpm --filter @weapp-pandacss/docs preview
pnpm --filter @weapp-pandacss/docs lint
pnpm --filter @weapp-pandacss/docs typecheck
pnpm --filter @weapp-pandacss/docs test:e2e
```

Content lives in `src/content/docs/`; each English page must have a matching filename under `zh/`.
`check:locales` runs before every build. Pagefind indexes both languages during the production build;
use `preview` to test search. Logo files in `public/` come from `assets/brand` at the repository root.

内容位于 `src/content/docs/`，中文在 `zh/` 下保留同名文件。构建前检查翻译覆盖，
生产构建生成双语 Pagefind 搜索索引，使用 `preview` 验证搜索。

Machine-readable routes: `/llms.txt`, `/zh/llms.txt`, `/llms-full.txt`, and each page's `/index.md` and `/index.mdx`.
Canonical URLs, language metadata, sitemap and robots all use `panda.weapp.dev`.

Nimbus's `/_nimbus/shiki.css` defines token color variables; `src/styles/code.css`
applies them for light and dark system themes. Verify computed token colors in both themes when changing code styles.

## Automatic language / 自动语言选择

On `/`, the client queries the same-origin `/api/locale` endpoint for Cloudflare's
connection country: `CN` opens `/zh/`, other countries keep the English homepage.
When country detection is unavailable, China time zones and the browser's preferred
language provide a fallback. Explicit `?lang=en` / `?lang=zh` and remembered manual
language switches take priority. Deep links keep their selected language.

访问 `/` 时，客户端通过本站 `/api/locale` 获取 Cloudflare 判定的访问地区：
`CN` 自动进入 `/zh/`，其他地区保留英文。地区检测不可用时，以中国时区和浏览器
首选语言兜底。手动切换会记住选择，`?lang=en` / `?lang=zh` 可显式指定语言；
深层链接不自动跳转。Astro 的纯静态预览没有地区接口，使用客户端兜底。

`test:e2e` builds the site and tests region detection, manual switches, storage
restrictions and API failures in Chromium, Firefox and WebKit. The region endpoint
returns `private, no-store`; it trusts Worker `request.cf` rather than client headers.

## Deployment / 部署

The site uses Cloudflare Worker static assets named `weapp-pandacss-docs`. `wrangler.jsonc`
binds its custom domain to `panda.weapp.dev`; Wrangler manages the domain and HTTPS certificate.
Authenticate with an account that owns the `weapp.dev` zone, then run from the monorepo root:

```sh
pnpm --filter @weapp-pandacss/docs exec wrangler whoami
pnpm --filter @weapp-pandacss/docs run deploy:check
pnpm --filter @weapp-pandacss/docs run deploy
```

`deploy:check` builds and performs a dry run. `deploy` builds and publishes the static output
and `worker/index.ts`. Only `/api/locale` runs Worker-first; documentation and search
remain static assets. The `ASSETS` binding serves fallback requests. Unknown routes return HTTP 404.
Build output, Wrangler state and local credentials are ignored; do not commit them.

使用拥有 `weapp.dev` 区域的 Cloudflare 账号部署。`deploy:check` 先构建再做 dry run，
`deploy` 构建后发布静态产物和地区接口，并绑定自定义域名。只有 `/api/locale`
优先执行 Worker，文档和搜索仍通过静态资源提供；`ASSETS` 绑定处理回退请求。
构建产物、Wrangler 状态与本地凭证不提交到仓库。

See `AGENTS.md`, `nimbus.json` and `UPSTREAM.md` for the template's maintenance contract.
