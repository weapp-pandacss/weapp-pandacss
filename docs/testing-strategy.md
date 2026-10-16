# Testing strategy and acceptance

The gate measures **all owned `packages/*/src/**/*.ts`** at 100% statements, branches, functions and lines, per file, including unimported source. No library implementation is excluded or annotated to inflate coverage. Generated framework bundles, examples and test runners are separate integration subjects. Complete code coverage does not mean every input, device or rendering behavior has been exhausted.

| Layer                    | Contract                                                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Runtime                  | ASCII, Unicode planes and surrogate code units, leading characters, whitespace, reserved markers, injectivity and independent decoding                             |
| Configuration / AST      | Immutable configuration, real Babel interop, version and malformed-artifact diagnostics, repeat generation, descriptors/symbols and `.raw`                         |
| PostCSS                  | Both targets, CSS variables, layers/pseudos, selector context and Cartesian expansion, disabled lifecycle                                                          |
| Real Panda 2.1.2 / 2.2.0 | `.js`/`.mjs`, hashing, regeneration/config reload, css/cva/sva, named/slot/compound recipes, patterns, styled, cx and tokens                                       |
| Published consumers      | Isolated offline tarballs, ESM/CJS, public types, compatible entry identity, zero-dependency runtime and serialized factory                                        |
| Framework artifacts      | Matching runtime names and final Taro React/Vue WXSS and Uni-app mini-program/H5 CSS                                                                               |
| Taro HTML hooks          | Installed core hydration and event hooks, native view class restoration, optimized node aliases and click-to-tap binding/removal                                   |
| Mini-program E2E         | Actual compiled Wevu WXML, component registration, taps, changing classes, WXSS matching, state isolation and fresh launches through mpcore                        |
| Browser E2E              | Production React, Chromium/Firefox/WebKit computed styles, hover, compounds/slots, repeated toggles, reload, narrow viewport, manual collisions and runtime errors |
| Real WeChat              | Opt-in IDE rendering, changing styles, WXSS matching, reLaunch reset and screenshots                                                                               |

The adapter's minimum Panda version is 2.1.2, with later stable releases accepted without an upper version bound. Version-gate tests cover older, invalid and prerelease versions as well as later stable releases; AST checks remain responsible for rejecting incompatible generated structures. Panda compatibility fixtures unpack the adapter into isolated consumers for exactly 2.1.2 and 2.2.0, using lockfile-pinned packages offline. These are the real tested cohorts, rather than an exhaustive test of every version in the supported range. Each consumer resolves its own Panda and matching presets; a workspace-wide import must not substitute the default 2.2.0 installation.

mpcore 1.0.0 tests real emitted artifacts but does not emulate WeChat CSS layout. Artifact checks do not claim framework interaction coverage. Real IDE/device acceptance remains a distinct layer.

`taro-html-hydration.test.ts` loads the installed Taro 4.3.0 core hydrator, event target, helpers and HTML hooks. The native `<view>` cases cover `pure-view`, `static-view`, `click-view`, `view` and `catch-view`, requiring the same `h5-view` class on first hydration and after class changes/restoration. It also checks click-to-tap handler dispatch/removal used by NutUI overlays and ordinary HTML tag mapping. Only the DOM node and update queue are fixtures; the HTML tag defaults come from the installed plugin's build entry.

The upstream HTML hook reads the already optimized hydration node name, so four of these seven tests fail. The pnpm patch for `@tarojs/plugin-html@4.3.0` reads the authored `node.nodeName` in both source and distributed runtime; all seven tests pass with the installed patch. Keep the standard HTML plugin configuration and the native `<view>` fixture: excluding `view` breaks click-to-tap mapping. This regression proves runtime-hook behavior; freshly built real IDE class restoration and NutUI interaction must still pass separately.

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

## Complete acceptance on one commit

`pnpm test:acceptance` runs the complete release-candidate gate serially. Commit the candidate first and keep the tracked working tree clean. The runner records the commit/tree identity, hashes pre-existing local `.env.test` and `stats/` files without changing them, and rejects uncommitted source or changes between gates. Do not start another build, watcher or IDE suite while it owns `e2e-artifacts/acceptance.lock`.

Prepare the exact Playwright browser revisions and the real IDE prerequisites below. Set `WEAPP_ACCEPTANCE_NODE22` and `WEAPP_ACCEPTANCE_NODE24` to absolute paths of Node **22.18.0** and **24.11.0** respectively. These executables test the published adapter's minimum supported runtimes; the private workspace itself uses its stricter development engine range. Consumer fixtures run actual packed ESM/CJS and declaration checks, including the offline Panda 2.1.2 and 2.2.0 cohorts.

The fixed sequence is frozen install → validate → package checks → repo doctor/full check → dependency/catalog consistency → audit comparison → minimum-Node consumers → Wevu → React Web → framework H5 → docs examples/browser/deployment dry run → development/watch → fresh mini-program builds → **two real IDE rounds**. Browser gates use Chromium, Firefox and WebKit. The final four mini-program builds happen once; both IDE rounds must retain the same commit and exact output hashes. The runner does not publish or deploy.

The docs `deploy:check` gate builds the site, runs Wrangler's deployment dry run, then checks the generated discovery assets. `check:deployment` validates route-specific `_headers`, ARD aliases and capability URLs, robots/sitemap coverage, UTF-8 text exports, nested LLM directory links and full-export page coverage. It can check existing artifacts without rebuilding. This static check verifies generated header rules; actual HTTP header behavior remains a deployment/runtime concern. Framework H5 tests also require exact child-prop backgrounds, font sizes and padding through all four toggles and reload, plus Uni-app Panda/Tailwind text transforms.

Each step writes a log and updates `result.json` under a unique `e2e-artifacts/acceptance/<time>-<sha>/` directory. `WEAPP_ACCEPTANCE_ARTIFACT_DIR` may select an absolute, unused destination. The development/watch suite and each IDE round have a 30-minute execution limit; the orchestrator allows 35 minutes for each so cancellation can finish cleanup and save evidence. Full acceptance runs all four watch frameworks and stores their evidence in its `dev-watch/` directory, overriding any diagnostic framework selection. Missing IDE login/service port, Node executables, browser payloads or scripts fail explicitly. There are no layer-selection or skip arguments; `--help` only describes the flow. A pass is recorded only after every gate and both independently recorded IDE runs succeed, including cleanup. Keep `pnpm test:e2e:devtools` as the separate **single-round** diagnostic entry.

`pnpm audit:acceptance` compares a fresh registry audit against the reviewed [2026-10-15 baseline](./dependency-review-2026-10-15.md): 3 critical, 19 high, 33 moderate and 6 low advisories remain. `e2e/audit-baseline.json` records all 61 GHSA identities, severities, affected versions and actual lockfile dependency edges from each workspace. New advisories, affected versions, escalation or dependency chains fail even if the total count is unchanged. Audit-provided path lists are bounded, so chain comparison traverses the complete workspace lockfile, including native pnpm's multiple YAML documents. This is a **no-new-risk comparison**, not a clean vulnerability audit; changes to the reviewed baseline require a separate explicit security review.

## Real IDE acceptance

Check the [official stable release](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html) immediately before running; select that installation, verify its actual host version, log in and enable the service port. Set `WEAPP_VITE_E2E_DEVTOOLS_CLI_PATH` to its absolute CLI, `WEAPP_VITE_E2E_APPID` to an authorized real AppID, matching `WEAPP_VITE_E2E_DEVTOOLS_STABLE_VERSION` / `WEAPP_VITE_E2E_DEVTOOLS_INSTALLED_VERSION`, and `WEAPP_VITE_E2E_DEVTOOLS_CHECKED_AT` to an ISO check time within 24 hours. Install the reference browser with `pnpm exec playwright install chromium`, then run `pnpm test:e2e:devtools`.

These version values are operator evidence of the official release channel. The connected IDE must also report the same actual host version through `Tool.getInfo.version`; `Tool.getInfo.SDKVersion` and `systemInfo.SDKVersion` must both match the pinned formal base library. Missing prerequisites fail explicitly. Never fall back to another installation/RC/nightly to make a test pass. The suite checks `wv ide doctor`, starts each application once using `wv auto`, and shares one test connection across its `reLaunch` scenarios. It copies each build into a unique temporary project, injects the AppID and formal base-library version there, and leaves repository AppID settings untouched.

The Wevu acceptance page verifies css/cva/sva, named/slot compound recipes, patterns, cx/merge, token values/variables, semantic and negative tokens, important declarations, encoding collisions, Unicode and unsafe heads. Navigation/back must retain its reactive state, while reLaunch resets it. Wevu, Taro React, Taro Vue, Uni-app and an independent native tarball consumer each repeat two reLaunch cycles with four user toggles, rendered class/style checks and neutral-state pixel comparisons. Framework probes also trace actual node classes to final WXSS declarations referencing Panda tokens and compare final variable values exactly. Uni-app checks reactive Panda/Tailwind props together; Taro Vue checks NutUI interaction; the native route checks component style isolation. The development/watch gate uses isolated compiler copies for add-style, token/import changes, delete-style and restore, explicitly recompiling and relaunching its IDE project for every phase.

`wv relaunch/current-page/screenshot/compare/tap/page-data` reuse the Wevu project's explicit endpoint. An owned observer connection records AppService errors during CLI commands, and rendered probes verify the CLI taps' actual page data and styles. The raw CLI full-screen diff is retained, then captures are cropped by measured `screenTop` and the app viewport must match pixel-for-pixel (excluding the IDE status-bar clock). CLI commands do not start another project.

Evidence includes SDK/systemInfo, viewport dimensions, style probes, CLI logs, exceptions and screenshots under `e2e-artifacts/devtools`. A temporary headless Chromium canonicalizes final WXSS token colors and is closed in `finally`. Uni-app converts OKLCH to RGB downstream, so the report records authored tokens, compiled values and computed styles without relaxing color assertions; the pinned WebView renderer resolves positive rpx dimensions to integer CSS pixels. This validates the installed IDE simulator, not a physical phone.

Listeners are attached before log forwarding is enabled. Teardown drains AppService work and performs an SDK roundtrip, then keeps the observer connected while the selected CLI closes only its temporary project and the owned endpoint disappears. It then disposes the SDK connection, checks the final exceptions/console errors and removes temporary files. Each cleanup step still runs when another step fails; operation, application and cleanup errors fail the run and retain evidence. Unrelated IDE windows are preserved. A repository lock prevents duplicate IDE suites. After force-kill or power loss, inspect ownership before recovering leftover resources; never use global kill/close commands. Report real IDE/device acceptance only when actually executed.

Add regressions before implementation fixes. Changes to Panda artifacts require coordinated generation, AST diagnostics, public types and framework checks. Do not update snapshots just to silence regressions, and do not infer visual/device compatibility from the coverage percentage. See the [Chinese guide](./testing-strategy.zh.md) for command and environment details.

Security review on 2026-10-09: the official IDE SDK’s obsolete minimist was fixed through a compatible mkdirp patch override. Findings remain at the existing baseline (6 low, 33 moderate, 24 high, 5 critical); this is not a clean security audit. See the [dependency review](./dependency-review-2026-10-09.md) for existing framework tooling findings.

## Ordered cascade layer regression

The compiler has unit coverage for nested/anonymous/repeated layers, important inversion, conditional wrappers, diagnostics and explicit legacy options. Three browser engines compare flattened computed styles with native layers for safe inputs; a specificity counterexample deliberately differs and must produce a warning/error. Wevu artifact tests cover both layer probes through state changes. Real IDE tests read their exact colors (normal order and important inversion) before/after taps and after `reLaunch`, saving `layer-styles.json` and screenshots. Headless mpcore still does not verify CSS layout. The real AppID is injected only into the temporary project; never copy `trial` from another fixture as the release base-library baseline.
