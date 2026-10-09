# weapp-pandacss

Documentation: [English](https://panda.weapp.dev/) · [简体中文](https://panda.weapp.dev/zh/).

Use [Panda CSS 2.1.2](https://panda-css.com/) in mini-programs and Web with matching, portable class names. The Panda plugin transforms generated runtime artifacts through ASTs before Panda writes them. The PostCSS plugin converts the CSS using the same naming contract.

## Install and configure

Use Node.js 22.18+ or 24.11+.

```bash
pnpm add -D @pandacss/dev@2.1.2 @pandacss/preset-base@2.1.2 @pandacss/preset-panda@2.1.2 weapp-pandacss postcss
```

```ts
// panda.config.ts
import { defineConfig } from '@pandacss/dev'
import { weappPanda } from 'weapp-pandacss/panda'

export default defineConfig({
  plugins: [weappPanda()],
  polyfill: false,
  presets: ['@pandacss/preset-base', '@pandacss/preset-panda'],
  include: ['./src/**/*.{js,jsx,ts,tsx,vue}'],
  outdir: 'styled-system',
  outExtension: 'mjs',
  forceImportExtension: true,
})
```

```js
// postcss.config.cjs
module.exports = {
  plugins: {
    '@pandacss/dev/postcss': {},
    'weapp-pandacss/postcss': { target: 'weapp' },
    // Put any rem/rpx conversion after the adapter.
  },
}
```

Add `@layer reset, base, tokens, recipes, utilities;` to your global CSS. Generate the runtime with `panda codegen` before building or starting development. Panda's PostCSS integration also runs the plugin when regenerating artifacts. Ignore `styled-system` in Git.

For Web/H5, register both plugins and use `target: 'web'`. Web keeps layers and pseudo-selector semantics; both targets use the same class names. Use separate generated directories and matching bundler aliases when building targets in parallel (see the Taro and Uni-app examples).

## Naming and public entries

Ordinary ASCII identifiers stay readable. Special characters become `_wp_<hex codepoint>_`; original `_wp_` markers and leading digits/hyphens are escaped too. `c_red.500` becomes `c_red_wp_2e_500`. Encode hand-written class lists before passing them to the UI:

```bash
pnpm add @weapp-pandacss/runtime
```

The standalone package does not install Panda, PostCSS or Babel. The existing `weapp-pandacss/runtime` entry remains supported and shares the same exports, including `createPortableRuntime()`.

```ts
import { encodeClassList } from '@weapp-pandacss/runtime'

const className = encodeClassList('custom/active 中文')
```

Keep authored CSS selectors in their original form (with normal CSS escapes). PostCSS encodes them. Do not encode `css()`, recipe outputs, or already encoded names again. `cx()` joins classes without encoding. Generated JS and CSS carry markers so the adapter can detect already converted artifacts.

The plugin enables Panda's native `hash.cssVar` and normalizes its variable prefix; it preserves your `hash.className` setting. Configured class prefixes and recipe labels with unsafe heads or reserved markers are canonicalized before Panda escapes CSS. It never renames variable declarations. In mini-program mode, unsupported hand-written variable identifiers fail with a diagnostic; use ASCII identifiers. `disabled: true` disables the entire CSS adapter.

`weapp-pandacss/panda`, `/postcss` and `/runtime` provide ESM and CJS entries with declarations. The root entry exports `weappPanda`, `postcssPlugin`, `encodeClassName` and `encodeClassList`. Version 2 removes the old file-patching/configuration APIs, both adapter CLI names and the PostCSS `naming` option. PostCSS options are passed directly to the plugin.

Panda 2.1.2 with `.js` or `.mjs` output is supported. Panda source-transform optimizations that inline raw classes and bypass runtime are outside this release's scope. See the [Chinese guide](./README.zh.md) and [2.0 migration guide](../../docs/panda-plugin-migration.md) for configuration and breaking changes.

The repository includes [Taro React, Taro Vue, Uni-app Vue, React Web and Weapp Vite + Wevu](../../examples/). The Wevu example runs `wv prepare` before Panda codegen on a clean checkout.

## Cascade layer compatibility

Mini-programs default to `cascadeLayers: { mode: 'ordered', onConflict: 'warning' }`. The compiler registers layer names in first-declaration order, flattens nested/anonymous/repeated layers, and emits ordinary selectors without generated `:not(n)` specificity placeholders. Normal declarations follow layer order, then unlayered declarations. Important declarations use the reverse order, with unlayered important declarations first. Source order inside each layer is preserved.

This provides **order compatibility**, not a complete native-layer polyfill. In WXSS, a lower-priority layer with a more specific selector can still override a higher-priority layer. The adapter reports potential conflicts through PostCSS warnings, with layer names, selectors, properties and source positions. Shorthands, logical properties and unknown functional selectors are analyzed conservatively; a warning does not prove that both selectors match a real element. Set `onConflict: 'error'` to fail the build on these diagnostics.

```js
export default {
  plugins: {
    '@pandacss/dev/postcss': {},
    'weapp-pandacss/postcss': {
      cascadeLayers: { mode: 'ordered', onConflict: 'error' },
    },
  },
}
```

Declare the full layer order outside conditional blocks before using layers in `@media` / `@supports`. Resolve imports and CSS nesting before the adapter. Unresolved `@import … layer(...)`, `revert-layer`, CSS nesting and already-polyfilled layer placeholders fail with actionable diagnostics. Keep Panda `polyfill: false`; regenerate CSS from its original layers. Web/H5 (`target: 'web'`) always retains native layers.

Ordering is local to one PostCSS root. Combine layered inputs before adaptation if their relative layer order matters; independently compiled files and isolated component styles do not share a global layer registry. The Wevu example uses shared application WXSS and explicitly declares component `styleIsolation: 'apply-shared'`.

Existing 2.x options remain supported: explicitly passing `removeNegationPseudoClass`, `selectorReplacement.cascadeLayers` or `cascadeLayersPluginOptions` selects the legacy pipeline. You can also choose `cascadeLayers: { mode: 'legacy' }`. Legacy is not a strict native-layer polyfill either. Combining an explicit `mode: 'ordered'` with old options is a configuration error. Ordinary authored `:not(...)` is preserved.

`isPseudoClassPluginOptions` still configures the csstools `:is()` transformation. No runtime or class-encoding change is required for this migration.
