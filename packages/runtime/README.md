# @weapp-pandacss/runtime

Dependency-free class encoding for Panda CSS, mini-programs and Web. ESM and CommonJS builds include TypeScript declarations and target ES2018. The package has no runtime dependencies, peer dependencies or Node APIs; your application bundler remains responsible for platform syntax support and polyfills.

## Install

```bash
pnpm add @weapp-pandacss/runtime
```

```ts
import { encodeClassList, encodeClassName } from '@weapp-pandacss/runtime'

encodeClassName('custom/active') // custom_wp_2f_active
encodeClassList('custom/active 中文') // custom_wp_2f_active _wp_4e2d__wp_6587_
```

```js
const { encodeClassName } = require('@weapp-pandacss/runtime')
```

Ordinary ASCII names remain readable. Special characters become `_wp_<hex codepoint>_`; original `_wp_` markers and leading digits or hyphens are escaped too. Unicode is encoded by complete codepoint, and class lists are split on whitespace.

Encode raw authored names once. The codec is **not idempotent**: do not encode Panda `css()`, recipe outputs or already encoded classes again. Keep authored CSS selectors in their original, normally escaped form and process them with `weapp-pandacss/postcss` to produce matching names. This package alone does not transform CSS or integrate Panda.

## Generation factory

`createPortableRuntime()` returns `{ encodeClassName, encodeClassList }`. Its implementation is self-contained so the Panda adapter can embed it in generated artifacts without package imports. Application code normally uses the two named encoding functions.

## Compatibility

`weapp-pandacss/runtime` remains supported and re-exports this implementation, including the factory. The adapter pins its runtime dependency to an exact version when packed; use the matching runtime version when publishing reusable components. The class encoding contract is unchanged by this extraction. An incompatible encoding change requires a major runtime release and coordinated adapter changes.

Documentation: [English](https://panda.weapp.dev/runtime/) · [简体中文](https://panda.weapp.dev/zh/runtime/).
