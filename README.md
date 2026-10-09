# weapp-pandacss

<img src="./assets/brand/logo.svg" alt="weapp-pandacss logo" width="128" height="128">

Use Panda CSS 2.1.2 in WeChat and other mini-program runtimes.

Documentation: [English](https://panda.weapp.dev/) · [简体中文](https://panda.weapp.dev/zh/).

This repository is a pnpm/Turborepo monorepo managed by [repoctl](https://github.com/icelib/repoctl). The published adapter lives in [packages/weapp-pandacss](./packages/weapp-pandacss); the [Chinese configuration guide](./packages/weapp-pandacss/README.zh.md) covers installation, PostCSS and runtime codegen.

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

Use Node.js 22.18+ (or 24.11+) and the pnpm version declared by `packageManager`:

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

Use `pnpm exec repo doctor` and `pnpm exec repo check` to validate workspace health. `pnpm change` records release intent; repoctl manages the release workflow. The published adapter is `2.0.0`. Generated `dist`, coverage and example `styled-system` directories are ignored; real Panda fixtures are generated in isolated temporary directories during tests.

Run `pnpm --filter @weapp-pandacss/docs dev` to edit the bilingual site. See [the documentation workspace](./apps/docs/README.md) for build, validation and Cloudflare deployment commands.

See the [2.0 plugin migration guide](./docs/panda-plugin-migration.md), [dependency compatibility notes](./docs/dependency-upgrade.md) for framework version cohorts and [the Wevu example guide](./examples/weapp-vite-app/README.md) for its development workflow.

## Testing

[Testing strategy and E2E acceptance](./docs/testing-strategy.md) · [中文测试指南](./docs/testing-strategy.zh.md)
