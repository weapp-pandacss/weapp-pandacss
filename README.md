# weapp-pandacss

Use Panda CSS 2.1.2 in WeChat and other mini-program runtimes.

This repository is a pnpm/Turborepo monorepo managed by [repoctl](https://github.com/icelib/repoctl). The published adapter lives in [packages/weapp-pandacss](./packages/weapp-pandacss); the [Chinese configuration guide](./packages/weapp-pandacss/README.zh.md) covers installation, PostCSS and runtime codegen.

## Workspaces

| Directory                 | Purpose                                                           |
| ------------------------- | ----------------------------------------------------------------- |
| `packages/weapp-pandacss` | Panda generation plugin, portable runtime, PostCSS and legacy CLI |
| `examples/taro-app`       | Taro React mini-program                                           |
| `examples/taro-app-vue3`  | Taro Vue mini-program                                             |
| `examples/uni-app-vue3`   | Uni-app Vue mini-program                                          |
| `examples/react-app`      | React web application                                             |
| `examples/weapp-vite-app` | Weapp Vite + Wevu Vue SFC mini-program                            |

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

Use `pnpm exec repo doctor` and `pnpm exec repo check` to validate workspace health. `pnpm change` records release intent; repoctl manages the release workflow. The package retains the published `1.5.5` baseline, and the major release intent prepares `2.0.0` when the release workflow runs. Generated `dist`, coverage and example `styled-system` directories are ignored; checked-in runtime fixtures remain available to the tests.

See the [2.0 plugin migration guide](./docs/panda-plugin-migration.md), [dependency compatibility notes](./docs/dependency-upgrade.md) for framework version cohorts and [the Wevu example guide](./examples/weapp-vite-app/README.md) for its development workflow.
