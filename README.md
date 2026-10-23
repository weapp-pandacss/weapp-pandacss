# weapp-pandacss

<img src="./assets/brand/logo.svg" alt="weapp-pandacss logo" width="128" height="128">

Use Panda CSS 2.2.0 in WeChat and other mini-program runtimes. The adapter accepts stable Panda releases from 2.1.2 onward (`>=2.1.2`); the examples use 2.2.0. Real consumer tests cover 2.1.2 and 2.2.0, and AST checks reject incompatible generated artifacts.

Documentation: [English](https://panda.weapp.dev/) · [简体中文](https://panda.weapp.dev/zh/).

This repository is a pnpm/Turborepo monorepo managed by [repoctl](https://github.com/icelib/repoctl). The published adapter lives in [packages/weapp-pandacss](./packages/weapp-pandacss); the [Chinese configuration guide](./packages/weapp-pandacss/README.zh.md) covers installation, PostCSS and runtime codegen.

## Documentation / 文档

| Start here                                          | English                                                     | 简体中文                                                |
| --------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------- |
| Install and generate your first styles / 安装与生成 | [Get started](https://panda.weapp.dev/get-started/)         | [快速开始](https://panda.weapp.dev/zh/get-started/)     |
| Configure your framework / 框架接入                 | [Frameworks](https://panda.weapp.dev/frameworks/)           | [框架指南](https://panda.weapp.dev/zh/frameworks/)      |
| Dynamic styles, components and builds / 场景处理    | [Guides](https://panda.weapp.dev/guides/)                   | [使用场景](https://panda.weapp.dev/zh/guides/)          |
| Adapter and common Panda APIs / API 大全            | [API reference](https://panda.weapp.dev/api/)               | [API 参考](https://panda.weapp.dev/zh/api/)             |
| Find a cause and verify a fix / 问题排查            | [Troubleshooting](https://panda.weapp.dev/troubleshooting/) | [排错指南](https://panda.weapp.dev/zh/troubleshooting/) |
| Upgrade an existing project / 旧版迁移              | [Migration](https://panda.weapp.dev/migration/)             | [迁移指南](https://panda.weapp.dev/zh/migration/)       |

The site documents every public adapter function and PostCSS option, with separate guides for Panda's generated styling APIs. Compatibility tables distinguish build-artifact checks, browser interactions and mini-program runtime checks. Every page also has Markdown/MDX exports; AI tools can use [llms.txt](https://panda.weapp.dev/llms.txt) or the [Chinese index](https://panda.weapp.dev/zh/llms.txt).

`weapp-pandacss/postcss` now needs one empty registration:

```js
module.exports = {
  plugins: { 'weapp-pandacss/postcss': {} },
}
```

It expands CSS imports, runs official Panda and adapts mini-program CSS by default. Keep Panda's config, `weappPanda()` and a global `.css` layer entry; H5 uses `{ target: 'web' }`. `imports`, `panda` and `adapter` can be disabled individually; `disabled: true` bypasses all stages. Sass/Less/Stylus are compiled by the framework. Unit conversion is built in and opt-in through `units`, defaulting to `false` for both targets with no inferred ratio. Configure `units: { rules: [{ from: 'rem', to: 'rpx', factor: 32 }] }` on the same plugin when needed; helpers and types come from the root package.

Source `@import` remains supported: the composed plugin expands the local graph before Panda and mini-program ordered compilation. The ordered core uses pinned `@weapp-tailwindcss/css-compat@0.1.2`; unresolved plain, layer-qualified or remote imports fail rather than silently changing precedence. Existing adapter and legacy options remain available. See [CSS compatibility](https://panda.weapp.dev/guides/css-compatibility/) / [CSS 兼容](https://panda.weapp.dev/zh/guides/css-compatibility/) for diagnostics and the source-input boundary.

## Brand assets

The selected logo is the Panda CSS P mark with a mini-program badge. All six designs, SVG sources, transparent PNGs and the comparison preview are available in [assets/brand](./assets/brand/README.md).

## Workspaces

| Directory                 | Purpose                                                         |
| ------------------------- | --------------------------------------------------------------- |
| `packages/weapp-pandacss` | Panda generation plugin, PostCSS and compatible runtime entries |
| `packages/runtime`        | Dependency-free `@weapp-pandacss/runtime` class encoding        |
| `apps/docs`               | Nimbus + Astro bilingual documentation at panda.weapp.dev       |
| `examples/taro-app`       | Taro React mini-program                                         |
| `examples/taro-app-vue3`  | Taro Vue mini-program                                           |
| `examples/uni-app-vue3`   | Uni-app Vue mini-program                                        |
| `examples/react-app`      | React web application                                           |
| `examples/weapp-vite-app` | Weapp Vite + Wevu Vue SFC mini-program                          |

The historical Linaria example remains in `examples/taro-app-linaria` as reference source. It does not use Panda and is outside the active workspace.

## Development

Repository development requires Node.js `^22.23.4 || ^24.22.1 || >=26.12.1` and the pnpm version declared by `packageManager`. Use Node 24.22.1 from `.nvmrc`; CI verifies Node 22.23.4 and 24.22.1 on Linux, Windows and macOS. Published packages retain their own consumer engine requirements.

```bash
corepack enable
pnpm install
pnpm exec repo init
pnpm build
pnpm lint
pnpm typecheck
pnpm tsd
pnpm test
pnpm pack:check
```

The five active examples share the root lockfile and depend on `weapp-pandacss` through `workspace:*`. Their build scripts run Panda codegen after Turbo has built the adapter. Every example registers the synchronous `codegen:prepare` plugin; the Wevu example runs `wv prepare` first. H5 and mini-programs share class naming and use separate generated directories when built in parallel.

```bash
pnpm --filter @weapp-pandacss/taro-app dev
pnpm --filter @weapp-pandacss/taro-app-vue3 dev
pnpm --filter @weapp-pandacss/uni-app-vue3 dev
pnpm --filter @weapp-pandacss/react-app dev
pnpm --filter @weapp-pandacss/weapp-vite-app dev
```

Use `pnpm exec repo doctor` and `pnpm exec repo check` to validate workspace health. `pnpm change` records release intent; repoctl manages the release workflow. See each package manifest for its version. Generated `dist`, coverage and example `styled-system` directories are ignored; real Panda fixtures are generated in isolated temporary directories during tests.

Git hooks use Lefthook. Installation enables staged ESLint and Stylelint fixes, affected workspace typechecks and commit-message validation; pre-push runs lint and typecheck. Run `pnpm exec lefthook install` to reinstall the hooks when needed.

Run `pnpm --filter @weapp-pandacss/docs dev` to edit the bilingual site. See [the documentation workspace](./apps/docs/README.md) for build, validation and Cloudflare deployment commands.

See the [2.0 plugin migration guide](./docs/panda-plugin-migration.md), [current dependency review](./docs/dependency-review-2026-10-13.md) for framework version cohorts and [the Wevu example guide](./examples/weapp-vite-app/README.md) for its development workflow. The [earlier dependency notes](./docs/dependency-upgrade.md) remain as upgrade history.

## Releases and documentation channels

Stable packages use the npm `latest` tag. The managed Release workflow checks `main` for nightly changes every day at 08:00 Asia/Shanghai and also supports manual nightly runs. repoctl publishes verified snapshots of both public packages under `snapshot-nightly`, preserving stable versions and release intents.

```bash
pnpm add -D weapp-pandacss@snapshot-nightly
# For applications that import the standalone runtime:
pnpm add @weapp-pandacss/runtime@snapshot-nightly
```

[Preview documentation](https://preview.panda.weapp.dev/) follows `main` and describes unreleased changes. [Production documentation](https://panda.weapp.dev/) advances after a complete stable package release and uses that release's verified source snapshot. Documentation-only corrections use repoctl's stable documentation flow. Both sites retain the English `/` and Chinese `/zh/` routes.

To inspect nightly without publishing, run the `Release` workflow on `main` with `mode=nightly` and `dry-run=true`. Failed runs retain their reports and package artifacts for diagnosis; retry through the managed workflow without editing versions, dist-tags or release ledgers. For a documentation deployment retry, use the `Documentation` workflow with the same channel and source/release inputs. See [deployment and recovery](./apps/docs/README.md#deployment--部署) for credentials, stable documentation corrections and receipt recovery. Before the first repoctl 6 stable completion record exists, the production site keeps its current content.

## Testing

[Testing strategy and E2E acceptance](./docs/testing-strategy.md) · [中文测试指南](./docs/testing-strategy.zh.md)

The root Vitest scripts use one outer worker because integration tests launch their own framework builders and compilers. This keeps those processes from competing for CI resources while preserving test timeouts and per-file 100% coverage requirements.

`pnpm docs:test` checks the documentation deployment adapters. `pnpm docs:test:e2e` validates the stable and preview site builds, including locale behavior, canonical URLs and preview indexing controls.
