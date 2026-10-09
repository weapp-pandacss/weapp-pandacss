# Testing strategy and acceptance

The gate measures **all owned `packages/*/src/**/*.ts`** at 100% statements, branches, functions and lines, per file, including unimported source. No library implementation is excluded or annotated to inflate coverage. Generated framework bundles, examples and test runners are separate integration subjects. Complete code coverage does not mean every input, device or rendering behavior has been exhausted.

| Layer               | Contract                                                                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Runtime             | ASCII, Unicode planes and surrogate code units, leading characters, whitespace, reserved markers, injectivity and independent decoding                             |
| Configuration / AST | Immutable configuration, real Babel interop, version and malformed-artifact diagnostics, repeat generation, descriptors/symbols and `.raw`                         |
| PostCSS             | Both targets, CSS variables, layers/pseudos, selector context and Cartesian expansion, disabled lifecycle                                                          |
| Real Panda 2.1.2    | `.js`/`.mjs`, hashing, regeneration/config reload, css/cva/sva, named/slot/compound recipes, patterns, styled, cx and tokens                                       |
| Published consumers | Isolated offline tarballs, ESM/CJS, public types, compatible entry identity, zero-dependency runtime and serialized factory                                        |
| Framework artifacts | Matching runtime names and final Taro React/Vue WXSS and Uni-app mini-program/H5 CSS                                                                               |
| Mini-program E2E    | Actual compiled Wevu WXML, component registration, taps, changing classes, WXSS matching, state isolation and fresh launches through mpcore                        |
| Browser E2E         | Production React, Chromium/Firefox/WebKit computed styles, hover, compounds/slots, repeated toggles, reload, narrow viewport, manual collisions and runtime errors |
| Real WeChat         | Opt-in IDE rendering, changing styles, WXSS matching, reLaunch reset and screenshots                                                                               |

mpcore tests real emitted artifacts but does not emulate WeChat CSS layout. Artifact checks do not claim framework interaction coverage. Real IDE/device acceptance remains a distinct layer.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm lint
pnpm typecheck
pnpm tsd
pnpm test
pnpm pack:check
pnpm exec repo doctor
pnpm exec playwright install chromium firefox webkit
pnpm test:e2e
```

The build includes five active examples and bilingual documentation. `pnpm test` enforces per-file 100% coverage; `pnpm test:coverage` also produces HTML, JSON and LCOV in `coverage/`. Run `test:e2e:web` or `test:e2e:weapp` independently. Root lint/typecheck include the E2E infrastructure.

CI keeps the six OS × Node 22/24 jobs and adds a Linux/Node 24 browser job. Browser tests run serially and headlessly in isolated contexts against an owned strict-port production preview. Existing servers cannot be reused. Playwright closes its browsers/server, saves failure traces/screenshots and publishes a 14-day report; flaky retries fail the gate. Do not run concurrent builds/watch/tests writing the same example outputs. Generated output and reports are ignored.

## Optional real IDE acceptance

Check the [official stable release](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html) immediately before running; select that installation, verify its actual host version, log in and enable the service port. Set `WEAPP_VITE_E2E_DEVTOOLS_CLI_PATH` to its absolute CLI, `WEAPP_VITE_E2E_APPID` to an authorized real AppID, matching `WEAPP_VITE_E2E_DEVTOOLS_STABLE_VERSION` / `WEAPP_VITE_E2E_DEVTOOLS_INSTALLED_VERSION`, and `WEAPP_VITE_E2E_DEVTOOLS_CHECKED_AT` to an ISO check time within 24 hours. Then run `pnpm test:e2e:devtools`.

These version values are operator evidence, not automatic SDK channel detection. Missing prerequisites fail explicitly. Never fall back to another installation/RC/nightly to make a test pass. This suite uses one connection and reLaunch between scenarios. It copies the build into a unique temporary project, injects the AppID and debug route there, records SDK/systemInfo and screenshots under `e2e-artifacts/devtools`, and leaves repository AppID settings untouched.

Teardown disconnects and closes only the temporary project with the selected CLI, then removes it. Cleanup failures fail the run; unrelated IDE windows are preserved. A repository lock prevents duplicate IDE suites. After force-kill or power loss, inspect ownership before recovering leftover resources; never use global kill/close commands. Report real IDE/device acceptance only when actually executed.

Add regressions before implementation fixes. Changes to Panda artifacts require coordinated generation, AST diagnostics, public types and framework checks. Do not update snapshots just to silence regressions, and do not infer visual/device compatibility from the coverage percentage. See the [Chinese guide](./testing-strategy.zh.md) for command and environment details.

Security review on 2026-10-09: the official IDE SDK’s obsolete minimist was fixed through a compatible mkdirp patch override. Findings remain at the existing baseline (6 low, 33 moderate, 24 high, 5 critical); this is not a clean security audit. See the [dependency review](./dependency-review-2026-10-09.md) for existing framework tooling findings.

## Ordered cascade layer regression

The compiler has unit coverage for nested/anonymous/repeated layers, important inversion, conditional wrappers, diagnostics and explicit legacy options. Three browser engines compare flattened computed styles with native layers for safe inputs; a specificity counterexample deliberately differs and must produce a warning/error. Wevu artifact tests cover both layer probes through state changes. Real IDE tests read their exact colors (normal order and important inversion) before/after taps and after `reLaunch`, saving `layer-styles.json` and screenshots. Headless mpcore still does not verify CSS layout. The real AppID is injected only into the temporary project; never copy `trial` from another fixture as the release base-library baseline.
