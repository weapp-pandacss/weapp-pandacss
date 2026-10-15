# weapp-pandacss

## 2.3.1

### Patch Changes

- 升级 CSS 兼容与 PostCSS 导入依赖，修复多文件导入的层顺序并完善兼容回归验证。

## 2.3.0

### Minor Changes

- 将 Panda CSS 最低版本设为 2.1.2，接受后续稳定版本并保留生成产物的 AST 结构校验；默认使用 2.2.0，新增 2.1.2 与 2.2.0 的真实解包消费者离线兼容测试。

### Patch Changes

- Updated dependencies:
  - @weapp-pandacss/runtime@1.0.1

## 2.2.0

### Minor Changes

- Use the shared CSS cascade layer compiler while preserving Panda adapter options and legacy diagnostics. Validate unresolved imports, expand example import graphs before naming, and cover cross-file cascade semantics in framework builds and three browser engines.

  The ordered compiler now uses `@weapp-tailwindcss/css-compat@0.1.1`. Source CSS can still use ordinary, layered and conditional imports; expand the complete import graph before Panda generation and ordered compilation. Unresolved imports now fail with `LAYER_IMPORT`, enforcing the documented preprocessing requirement. The shared compiler also validates native nesting, `revert-layer`, layer names, selectors, custom property names and residual preprocessor directives instead of producing incomplete output.

  PostCSS warnings retain the three `WP_LAYER_*` compatibility text prefixes and expose the upstream `LAYER_*` code, structured diagnostic and source position. Compilation errors include the primary error diagnostic, the complete diagnostic list and the original cause. Web, disabled and explicit csstools legacy behavior remain unchanged.

  Taro examples now expand imports before Panda and class encoding. The Uni-app example expands imports relative to the real Panda entry, forwards dependency/watch information, and compiles mini-program layers before Tailwind aggregation can change their priority; H5 retains native layers.

- Add optional built-in rule-based length unit conversion after the zero-option PostCSS pipeline, with public presets and rule helpers.

- Make weapp-pandacss/postcss a zero-option import → Panda → adapter pipeline. Imports, Panda generation and adaptation are enabled by default, with independent stage switches; preserve source maps, diagnostics and watch dependencies, discover the nearest project config, and report duplicate stages or raw preprocessor imports. Keep framework preprocessing and explicit H5 target selection.

## 2.1.0

### Minor Changes

- Compile mini-program cascade layer order without generated specificity placeholders, preserve explicit legacy options, and add browser parity and real WeChat layer-style tests.

### Patch Changes

- Preserve selector context and expand all alternatives when adapting universal, root and :where selectors for mini-programs.

## 2.0.1

### Patch Changes

- docs: 升级 repoctl 并上线 Nimbus 双语文档与品牌素材 (#150)

- Extract portable class encoding into @weapp-pandacss/runtime while preserving every existing adapter entry.

## 2.0.0

### Major Changes

- Migrate to a repoctl-managed monorepo and support Panda CSS 2.1.2.

- Replace runtime file patching with the Panda 2.1.2 generation plugin; introduce portable class naming, native hashed CSS variables and matching Web/mini-program PostCSS targets. Remove the old patching/configuration APIs, both adapter CLI names, runtime backups/rollback and legacy PostCSS naming. Register weappPanda() and regenerate runtime and CSS together.

### Patch Changes

- Refresh compatible dependencies and document the Weapp Vite + Wevu integration.
