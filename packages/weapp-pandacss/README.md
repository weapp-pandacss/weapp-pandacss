# weapp-pandacss

Documentation: [English](https://panda.weapp.dev/) · [简体中文](https://panda.weapp.dev/zh/).

Use [Panda CSS 2.1.2](https://panda-css.com/) in mini-programs and Web with matching, portable class names. The Panda plugin transforms generated runtime artifacts through ASTs before Panda writes them. The PostCSS plugin converts the CSS using the same naming contract.

> **Release availability:** Zero-option composition is the repository implementation for the upcoming minor release. The currently published npm package retains its previous defaults; keep its separate import/Panda/adapter configuration until upgrading, then use the setup below. Release automation determines the version number.

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
    'weapp-pandacss/postcss': {},
    // Add units only when the project needs conversion.
  },
}
```

Empty options enable import expansion → official Panda generation → mini-program adaptation. Do not separately install/register `postcss-import` or `@pandacss/dev/postcss`; the importer is built in. Unit conversion is built in through opt-in `units`, defaulting to `false` with no inferred ratio. Add `@layer reset, base, tokens, recipes, utilities;` to your global CSS. Generate the runtime with `panda codegen` before building or starting development. Panda's PostCSS integration also runs the plugin when regenerating artifacts. Ignore `styled-system` in Git.

For Web/H5, keep `weappPanda()` and use `target: 'web'`. Web keeps layers and pseudo-selector semantics; both targets use the same class names. Use separate generated directories and matching bundler aliases when building targets in parallel (see the Taro and Uni-app examples).

## Stage options and preprocessors

`imports`, `panda` and `adapter` default to `true`. The first two also accept upstream option objects. Existing adaptation options remain at the top level. Use `{ imports: false, panda: false }` for pure adaptation, `{ adapter: false }` to skip adaptation while retaining imports, Panda and configured units, or `{ disabled: true }` to bypass everything. An external Panda/importer stage must replace its internal counterpart and run before stages consuming its output.

Panda discovers explicit `panda.cwd/configPath`, then the nearest config above the real CSS file, then process cwd. A discovered config's directory is the project root; invalid explicit configuration fails directly. Custom loaders pass the real PostCSS `from` and forward file/directory dependencies and source maps. A string without file context can be adapted, but Panda generation skips it; relative imports need a real filename or `imports.root`.

Keep the global Panda layer entry as `.css`. Sass/Less/Stylus variables, mixins and nesting are compiled by the framework first. The built-in importer expands CSS and rejects raw `.scss/.sass/.less/.styl/.stylus` imports unless a custom loader supplies compiled CSS. The built-in `units` stage converts compiled CSS after complete adaptation and before framework postprocessing. The [PostCSS reference](https://panda.weapp.dev/api/postcss-plugin/) lists every stage option, default and callback.

## Built-in unit conversion

Empty PostCSS options preserve all units. To keep a `1rem = 32rpx` design scale,
configure the same plugin; no extra converter installation is needed:

```js
module.exports = {
  plugins: {
    'weapp-pandacss/postcss': {
      units: { rules: [{ from: 'rem', to: 'rpx', factor: 32 }] },
    },
  },
}
```

Rules support strings, regexes and functions, custom factors and signed callbacks.
`minValue` compares absolute magnitude. Default CSS tokenization protects strings,
URLs, identifiers and complete `var()` fallbacks. The first matching rule wins;
values do not chain in one run, but repeated processing may convert again.
`adapter: false` retains configured units; `disabled: true` bypasses all stages.
Import `unitPresets`, `composeUnitRules` and `UnitConversionOptions` from
`weapp-pandacss` to compose typed presets. See [all unit options and boundaries](https://panda.weapp.dev/api/postcss-plugin/#built-in-unit-conversion).

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

The plugin enables Panda's native `hash.cssVar` and normalizes its variable prefix; it preserves your `hash.className` setting. Configured class prefixes and recipe labels with unsafe heads or reserved markers are canonicalized before Panda escapes CSS. It never renames variable declarations. In mini-program mode, unsupported hand-written variable identifiers fail with a diagnostic; use ASCII identifiers. `disabled: true` bypasses the complete pipeline, including imports and Panda generation.

`weapp-pandacss/panda`, `/postcss` and `/runtime` provide ESM and CJS entries with declarations. The root entry exports `weappPanda`, `postcssPlugin`, `encodeClassName`, `encodeClassList`, `unitPresets`, `composeUnitRules`, and complete option/rule/context/preset types. Version 2 removes the old file-patching/configuration APIs, both adapter CLI names and the PostCSS `naming` option. PostCSS options are passed directly to the plugin.

Panda 2.1.2 with `.js` or `.mjs` output is supported. Panda source-transform optimizations that inline raw classes and bypass runtime are outside this release's scope. See the [Chinese guide](./README.zh.md) and [2.0 migration guide](../../docs/panda-plugin-migration.md) for configuration and breaking changes.

The repository includes [Taro React, Taro Vue, Uni-app Vue, React Web and Weapp Vite + Wevu](../../examples/). The Wevu example runs `wv prepare` before Panda codegen on a clean checkout.

## Cascade layer compatibility

Mini-programs default to `cascadeLayers: { mode: 'ordered', onConflict: 'warning' }`. Ordered compilation uses the pinned `@weapp-tailwindcss/css-compat@0.1.1` core behind the adapter; applications do not need to import that package directly. The compiler registers layer names in first-declaration order, flattens nested/anonymous/repeated layers, and emits ordinary selectors without generated `:not(n)` specificity placeholders. Normal declarations follow layer order, then unlayered declarations. Important declarations use the reverse order, with unlayered important declarations first. Source order inside each layer is preserved.

This provides **order compatibility**, not a complete native-layer polyfill. In WXSS, a lower-priority layer with a more specific selector can still override a higher-priority layer. The adapter reports potential conflicts through PostCSS warnings, with layer names, selectors, properties and source positions. Shorthands, logical properties and unknown functional selectors are analyzed conservatively; a warning does not prove that both selectors match a real element. Set `onConflict: 'error'` to fail the build on these diagnostics.

```js
export default {
  plugins: {
    'weapp-pandacss/postcss': {
      cascadeLayers: { mode: 'ordered', onConflict: 'error' },
    },
  },
}
```

Declare the full layer order outside conditional blocks before using layers in `@media` / `@supports`. Source CSS can use ordinary `@import`, including layer-qualified imports. Expand the complete import graph and CSS nesting before the adapter. **Any remaining `@import` fails ordered compilation**, including plain and remote imports, even if the current file has no layers: unseen imported rules can change layer order or unlayered precedence. `postcss-import` leaves remote imports in place, so vendor those styles locally or use an earlier resolver that expands them. Never delete imports just to silence the check. `revert-layer`, unexpanded preprocessing syntax, invalid layer structures and already-polyfilled layer placeholders also fail. Keep Panda `polyfill: false`; regenerate CSS from its original layers. Web/H5 (`target: 'web'`) always retains native layers.

The existing `WP_LAYER_SPECIFICITY`, `WP_LAYER_CONDITIONAL_ORDER` and `WP_LAYER_SELECTOR_UNKNOWN` text prefixes remain compatible. Structured PostCSS warnings use the core's `LAYER_*` codes and include the original diagnostic and source location; strict mode throws a PostCSS `CssSyntaxError` with diagnostics and its cause. Descriptor order and unfamiliar wrapper semantics can add compatibility warnings, promoted to errors by `onConflict: 'error'`. Legacy still uses the existing csstools pipeline, not the shared package's `/legacy` entry. Existing adapter fields and legacy selection remain supported; the new stage switches enable the composed pipeline by default. Runtime and class encoding keep their existing contract. See the [PostCSS API](https://panda.weapp.dev/api/postcss-plugin/) for diagnostic handling.

Ordering is local to one PostCSS root. Combine layered inputs before adaptation if their relative layer order matters; independently compiled files and isolated component styles do not share a global layer registry. The Wevu example uses shared application WXSS and explicitly declares component `styleIsolation: 'apply-shared'`.

Existing 2.x options remain supported: explicitly passing `removeNegationPseudoClass`, `selectorReplacement.cascadeLayers` or `cascadeLayersPluginOptions` selects the legacy pipeline. You can also choose `cascadeLayers: { mode: 'legacy' }`. Legacy is not a strict native-layer polyfill either. Combining an explicit `mode: 'ordered'` with old options is a configuration error. Ordinary authored `:not(...)` is preserved.

`isPseudoClassPluginOptions` still configures the csstools `:is()` transformation. No runtime or class-encoding change is required for this migration.
