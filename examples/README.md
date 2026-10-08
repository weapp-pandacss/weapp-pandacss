# Examples

The Panda examples are workspaces in the root monorepo. Install dependencies once at the repository root with `pnpm install`, then run `pnpm build` to build the adapter and all four applications. Each build generates Panda CSS 2.1.2 runtime files and applies the local weapp adapter through `workspace:*`.

Run one example with `pnpm --filter @weapp-pandacss/taro-app build` (or `taro-app-vue3`, `uni-app-vue3`, `react-app`). Build output and generated `styled-system` directories are ignored.

`taro-app-linaria` is preserved as historical reference source and does not participate in the Panda workspace.
