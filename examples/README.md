# Examples

The Panda examples are workspaces in the root monorepo. Install dependencies once at the repository root with `pnpm install`, then run `pnpm build` to build the adapter and all five applications. Each build generates Panda CSS 2.2.0 runtime files and applies the local weapp adapter through `workspace:*`.

Developing this private workspace requires Node.js `^22.22.3 || ^24.16.0 || >=26.3.0`, including the documentation toolchain. The published adapter retains its Node.js engine range of `^22.18.0 || >=24.11.0`; applications consuming the package follow that range and their own framework requirements.

Run one example with `pnpm --filter @weapp-pandacss/taro-app build` (or `taro-app-vue3`, `uni-app-vue3`, `react-app`, `weapp-vite-app`). Build the adapter first when invoking an example directly. Build output and generated `styled-system` directories are ignored.

The Taro and Uni-app configurations share [build-env.cjs](./build-env.cjs): `resolveBuildEnv('taro' | 'uni', snapshot)` returns `{ platform, cssTarget }` from the supplied environment snapshot. It uses `@weapp-tailwindcss/env`, pinned to `0.2.0` in the root development dependencies, only for example configuration. `platform` retains the framework's original value for generated directories, aliases and build outputs; missing values default to `weapp` for Taro and `mp-weixin` for Uni-app. Only the exact platform `h5` selects `cssTarget: 'web'`; other values keep `weapp`. Environment classification flags do not establish platform support. The [platform runner](./run-platform.mjs) sets the environment before Panda codegen, then starts the framework with the same environment.

The [Weapp Vite + Wevu example](./weapp-vite-app/README.md) includes native mini-program interaction tests, `css()` and `cva()` authoring, and the Panda generation plugin. It also ignores generated `.weapp-vite` support files. See the [bilingual framework guide](https://panda.weapp.dev/frameworks/).

Ordinary examples register one composed `weapp-pandacss/postcss` plugin for import expansion → Panda → adaptation; built-in units are opt-in and preserve the configured rem scale. Vite/Weapp Vite expand local imports before configured PostCSS plugins. Uni-app's Panda virtual entry expands imports from the real entry path before Panda and tracks dependencies for watch. The virtual entry explicitly sets `units: false` for all targets and `adapter: false` for H5; conversion occurs once in the final framework pass. Tailwind CSS uses the same entry with `{ imports: false, panda: false, adapter: false, units: ... }` for conversion alone, preserving its class namespace. Only mini-programs run adaptation in that virtual stage to preserve order before Tailwind's generator; H5 keeps native layers there and encodes classes later in framework PostCSS. Running the Web adapter early can cause Tailwind to flatten H5 layers. Source imports must be fully expanded before mini-program ordered compilation; framework-generated WXSS imports of independently compiled assets can remain. See [CSS import handling](https://panda.weapp.dev/guides/css-compatibility/) / [CSS 导入处理](https://panda.weapp.dev/zh/guides/css-compatibility/).

## Pick a framework / 选择框架

| Example               | Guide                                                   | 中文指南                                                  | Checked behavior                                      |
| --------------------- | ------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------- |
| Weapp Vite + Wevu     | [Setup](https://panda.weapp.dev/frameworks/weapp-vite/) | [接入](https://panda.weapp.dev/zh/frameworks/weapp-vite/) | Generated WXSS and headless mini-program state/events |
| Taro React, Webpack 5 | [Setup](https://panda.weapp.dev/frameworks/taro-react/) | [接入](https://panda.weapp.dev/zh/frameworks/taro-react/) | WeChat/H5 build artifacts                             |
| Taro Vue, Webpack 5   | [Setup](https://panda.weapp.dev/frameworks/taro-vue/)   | [接入](https://panda.weapp.dev/zh/frameworks/taro-vue/)   | WeChat/H5 build artifacts                             |
| Uni-app Vue           | [Setup](https://panda.weapp.dev/frameworks/uni-app/)    | [接入](https://panda.weapp.dev/zh/frameworks/uni-app/)    | WeChat/H5 build artifacts, Panda/Tailwind separation  |
| React Web             | [Setup](https://panda.weapp.dev/frameworks/web/)        | [接入](https://panda.weapp.dev/zh/frameworks/web/)        | Computed styles and interactions in three browsers    |

Build scripts for additional targets are not compatibility evidence. Use the guide's support matrix before selecting Taro Vite, native mini-programs or another target. See [scenario guides](https://panda.weapp.dev/guides/) / [使用场景](https://panda.weapp.dev/zh/guides/) for class encoding, dynamic styles, component isolation and concurrent builds.

`taro-app-linaria` is preserved as historical reference source and does not participate in the Panda workspace.

Authored class encoding imports `@weapp-pandacss/runtime` with an explicit workspace dependency in the Taro React and Wevu examples. Panda and PostCSS configuration continue using `weapp-pandacss`; build the adapter with its runtime dependency via `pnpm exec turbo run build --filter=weapp-pandacss`.
