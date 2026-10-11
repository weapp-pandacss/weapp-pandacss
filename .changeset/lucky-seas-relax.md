---
"weapp-pandacss": minor
---

Use the shared CSS cascade layer compiler while preserving Panda adapter options and legacy diagnostics. Validate unresolved imports, expand example import graphs before naming, and cover cross-file cascade semantics in framework builds and three browser engines.

The ordered compiler now uses `@weapp-tailwindcss/css-compat@0.1.1`. Source CSS can still use ordinary, layered and conditional imports; expand the complete import graph before Panda generation and ordered compilation. Unresolved imports now fail with `LAYER_IMPORT`, enforcing the documented preprocessing requirement. The shared compiler also validates native nesting, `revert-layer`, layer names, selectors, custom property names and residual preprocessor directives instead of producing incomplete output.

PostCSS warnings retain the three `WP_LAYER_*` compatibility text prefixes and expose the upstream `LAYER_*` code, structured diagnostic and source position. Compilation errors include the primary error diagnostic, the complete diagnostic list and the original cause. Web, disabled and explicit csstools legacy behavior remain unchanged.

Taro examples now expand imports before Panda and class encoding. The Uni-app example expands imports relative to the real Panda entry, forwards dependency/watch information, and compiles mini-program layers before Tailwind aggregation can change their priority; H5 retains native layers.
