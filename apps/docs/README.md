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

The site uses Cloudflare static assets named `weapp-pandacss-docs`, with no Worker script.
Static asset requests are free under [Cloudflare's static asset billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/).
`wrangler.jsonc`
binds its custom domain to `panda.weapp.dev`; Wrangler manages the domain and HTTPS certificate.
Authenticate with an account that owns the `weapp.dev` zone, then run from the monorepo root:

```sh
pnpm --filter @weapp-pandacss/docs exec wrangler whoami
pnpm --filter @weapp-pandacss/docs run deploy:check
pnpm --filter @weapp-pandacss/docs run deploy
```

`deploy:check` builds and performs a dry run. `deploy` builds and publishes only the static
output, without a `main` entry, an `ASSETS` binding or `run_worker_first`.
Unknown routes, including the removed `/api/locale`, return HTTP 404.
Build output, Wrangler state and local credentials are ignored; do not commit them.

使用拥有 `weapp.dev` 区域的 Cloudflare 账号部署。`deploy:check` 先构建再做 dry run，
`deploy` 构建后仅发布静态产物并绑定自定义域名，不包含 Worker 脚本或地区接口，
静态资源请求按 Cloudflare 当前计费规则免费。未知路由（含已移除的 `/api/locale`）返回 404。
构建产物、Wrangler 状态与本地凭证不提交到仓库。

See `AGENTS.md`, `nimbus.json` and `UPSTREAM.md` for the template's maintenance contract.
