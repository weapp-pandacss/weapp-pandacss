# Examples

The Panda examples are workspaces in the root monorepo. Install dependencies once at the repository root with `pnpm install`, then run `pnpm build` to build the adapter and all five applications. Each build generates Panda CSS 2.1.2 runtime files and applies the local weapp adapter through `workspace:*`.

Run one example with `pnpm --filter @weapp-pandacss/taro-app build` (or `taro-app-vue3`, `uni-app-vue3`, `react-app`, `weapp-vite-app`). Build the adapter first when invoking an example directly. Build output and generated `styled-system` directories are ignored.

The [Weapp Vite + Wevu example](./weapp-vite-app/README.md) includes native mini-program interaction tests, `css()` and `cva()` authoring, and the Panda generation plugin. It also ignores generated `.weapp-vite` support files. See the [bilingual framework guide](https://panda.weapp.dev/frameworks/).

## Pick a framework / 选择框架

| Example               | Guide                                                   | 中文指南                                                  | Checked behavior                                      |
| --------------------- | ------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------- |
| Weapp Vite + Wevu     | [Setup](https://panda.weapp.dev/frameworks/weapp-vite/) | [接入](https://panda.weapp.dev/zh/frameworks/weapp-vite/) | Generated WXSS and headless mini-program state/events |
| Taro React, Webpack 5 | [Setup](https://panda.weapp.dev/frameworks/taro-react/) | [接入](https://panda.weapp.dev/zh/frameworks/taro-react/) | WeChat build artifacts                                |
| Taro Vue, Webpack 5   | [Setup](https://panda.weapp.dev/frameworks/taro-vue/)   | [接入](https://panda.weapp.dev/zh/frameworks/taro-vue/)   | WeChat build artifacts                                |
| Uni-app Vue           | [Setup](https://panda.weapp.dev/frameworks/uni-app/)    | [接入](https://panda.weapp.dev/zh/frameworks/uni-app/)    | WeChat/H5 build artifacts, Panda/Tailwind separation  |
| React Web             | [Setup](https://panda.weapp.dev/frameworks/web/)        | [接入](https://panda.weapp.dev/zh/frameworks/web/)        | Computed styles and interactions in three browsers    |

Build scripts for additional targets are not compatibility evidence. Use the guide's support matrix before selecting Taro Vite, native mini-programs or another target. See [scenario guides](https://panda.weapp.dev/guides/) / [使用场景](https://panda.weapp.dev/zh/guides/) for class encoding, dynamic styles, component isolation and concurrent builds.

`taro-app-linaria` is preserved as historical reference source and does not participate in the Panda workspace.

Authored class encoding imports `@weapp-pandacss/runtime` with an explicit workspace dependency in the Taro React and Wevu examples. Panda and PostCSS configuration continue using `weapp-pandacss`; build the adapter with its runtime dependency via `pnpm exec turbo run build --filter=weapp-pandacss`.
