# weapp-pandacss

## 2.0.0

### Major Changes

- Migrate to a repoctl-managed monorepo and support Panda CSS 2.1.2.

- Replace runtime file patching with the Panda 2.1.2 generation plugin; introduce portable class naming, native hashed CSS variables and matching Web/mini-program PostCSS targets. Remove the old patching/configuration APIs, both adapter CLI names, runtime backups/rollback and legacy PostCSS naming. Register weappPanda() and regenerate runtime and CSS together.

### Patch Changes

- Refresh compatible dependencies and document the Weapp Vite + Wevu integration.
