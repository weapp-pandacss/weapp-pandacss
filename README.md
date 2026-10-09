# weapp-pandacss

<img src="./assets/brand/logo.svg" alt="weapp-pandacss logo" width="128" height="128">

Use Panda CSS 2.1.2 in WeChat and other mini-program runtimes.

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

Use a Node.js version matching the root `engines` field and the pnpm version declared by `packageManager`. CI verifies Node 22 and 24:

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

Run `pnpm --filter @weapp-pandacss/docs dev` to edit the bilingual site. See [the documentation workspace](./apps/docs/README.md) for build, validation and Cloudflare deployment commands.

See the [2.0 plugin migration guide](./docs/panda-plugin-migration.md), [dependency compatibility notes](./docs/dependency-upgrade.md) for framework version cohorts and [the Wevu example guide](./examples/weapp-vite-app/README.md) for its development workflow.

## Testing

[Testing strategy and E2E acceptance](./docs/testing-strategy.md) · [中文测试指南](./docs/testing-strategy.zh.md)
