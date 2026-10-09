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
```

Content lives in `src/content/docs/`; each English page must have a matching filename under `zh/`.
`check:locales` runs before every build. Pagefind indexes both languages during the production build;
use `preview` to test search. Logo files in `public/` come from `assets/brand` at the repository root.

内容位于 `src/content/docs/`，中文在 `zh/` 下保留同名文件。构建前检查翻译覆盖，
生产构建生成双语 Pagefind 搜索索引，使用 `preview` 验证搜索。

Machine-readable routes: `/llms.txt`, `/zh/llms.txt`, `/llms-full.txt`, and each page's `/index.md` and `/index.mdx`.
Canonical URLs, language metadata, sitemap and robots all use `panda.weapp.dev`.

## Deployment / 部署

The site is a static Cloudflare Worker named `weapp-pandacss-docs`. `wrangler.jsonc`
binds its custom domain to `panda.weapp.dev`; Wrangler manages the domain and HTTPS certificate.
Authenticate with an account that owns the `weapp.dev` zone, then run from the monorepo root:

```sh
pnpm --filter @weapp-pandacss/docs exec wrangler whoami
pnpm --filter @weapp-pandacss/docs run deploy:check
pnpm --filter @weapp-pandacss/docs run deploy
```

`deploy:check` builds and performs a dry run. `deploy` builds and publishes the same static output.
No Worker runtime code or application bindings are needed. Unknown routes return HTTP 404.
Build output, Wrangler state and local credentials are ignored; do not commit them.

使用拥有 `weapp.dev` 区域的 Cloudflare 账号部署。`deploy:check` 先构建再做 dry run，
`deploy` 构建后发布静态产物，并绑定自定义域名。无需服务端 runtime 或应用绑定。
构建产物、Wrangler 状态与本地凭证不提交到仓库。

See `AGENTS.md`, `nimbus.json` and `UPSTREAM.md` for the template's maintenance contract.
