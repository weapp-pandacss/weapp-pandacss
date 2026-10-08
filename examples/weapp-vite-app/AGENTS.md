# Panda CSS + Weapp Vite + Wevu

This is a private WeChat mini-program example in the root repoctl workspace.
Read `node_modules/weapp-vite/dist/docs/vue-sfc.md` and `wevu-authoring.md`
before changing Vue SFC or runtime behavior.

- Import reactive APIs from `wevu`, and use native mini-program tags/events.
- Build the adapter first: `pnpm --filter weapp-pandacss build`.
- Run `pnpm --filter @weapp-pandacss/weapp-vite-app build` or `dev` from the root.
- Run `wv prepare` before Panda codegen on a clean checkout: Panda reads the
  solution tsconfig, which references `.weapp-vite` support files.
- Panda's synchronous `codegen:done` hook patches each generated runtime.
  Do not replace it with an unawaited async call or a separate watch process.
- Keep Panda generation and the PostCSS adapter's class escaping together.
- Run `typecheck`, `lint`, and `test`; tests execute real compiled WXML through
  mpcore and check class/selector matching, not browser DOM or CSS layout.
- Do not commit `.weapp-vite`, `styled-system`, `dist`, or private IDE settings.
