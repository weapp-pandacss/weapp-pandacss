# weapp-pandacss

Use Panda CSS 2.1.2 in WeChat and other mini-program runtimes.

This repository is a pnpm/Turborepo monorepo managed by [repoctl](https://github.com/icelib/repoctl). The published adapter lives in [packages/weapp-pandacss](./packages/weapp-pandacss); the [Chinese configuration guide](./packages/weapp-pandacss/README.zh.md) covers installation, PostCSS and runtime codegen.

## Workspaces

| Directory                 | Purpose                                                                  |
| ------------------------- | ------------------------------------------------------------------------ |
| `packages/weapp-pandacss` | ESM/CJS adapter, PostCSS plugin and `weapp-panda` / `weapp-pandacss` CLI |
| `examples/taro-app`       | Taro React mini-program                                                  |
| `examples/taro-app-vue3`  | Taro Vue mini-program                                                    |
| `examples/uni-app-vue3`   | Uni-app Vue mini-program                                                 |
| `examples/react-app`      | React web application                                                    |

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

The four active examples share the root lockfile and depend on `weapp-pandacss` through `workspace:*`. Their build scripts run Panda codegen followed by weapp codegen after Turbo has built the adapter. Runtime generation runs during builds so a clean install works before the adapter's `dist` exists.

```bash
pnpm --filter @weapp-pandacss/taro-app dev
pnpm --filter @weapp-pandacss/taro-app-vue3 dev
pnpm --filter @weapp-pandacss/uni-app-vue3 dev
pnpm --filter @weapp-pandacss/react-app dev
```

Use `pnpm exec repo doctor` and `pnpm exec repo check` to validate workspace health. `pnpm change` records release intent; repoctl manages the release workflow. The package retains the published `1.5.5` baseline, and the major release intent prepares `2.0.0` when the release workflow runs. Generated `dist`, coverage and example `styled-system` directories are ignored; checked-in runtime fixtures remain available to the tests.
