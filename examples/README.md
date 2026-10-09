# Examples

The Panda examples are workspaces in the root monorepo. Install dependencies once at the repository root with `pnpm install`, then run `pnpm build` to build the adapter and all five applications. Each build generates Panda CSS 2.1.2 runtime files and applies the local weapp adapter through `workspace:*`.

Run one example with `pnpm --filter @weapp-pandacss/taro-app build` (or `taro-app-vue3`, `uni-app-vue3`, `react-app`, `weapp-vite-app`). Build the adapter first when invoking an example directly. Build output and generated `styled-system` directories are ignored.

The [Weapp Vite + Wevu example](./weapp-vite-app/README.md) includes native mini-program interaction tests, `css()` and `cva()` authoring, and the Panda generation plugin. It also ignores generated `.weapp-vite` support files. See the [bilingual framework guide](https://panda.weapp.dev/frameworks/).

`taro-app-linaria` is preserved as historical reference source and does not participate in the Panda workspace.
