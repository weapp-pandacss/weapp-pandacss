# Upstream source

This template adapts the static empty starter from [Cloudflare Nimbus](https://github.com/cloudflare/nimbus), released under the MIT license (see `LICENSE`).

- Starter tag: `templates-v0.7.9`
- Starter commit: `aae348048a8c659f84c39696ee6b20c2ad2f5ae2`
- Initial template Nimbus package: `@cloudflare/nimbus-docs@0.16.0`
- Initial template Astro: `7.3.6`

Nimbus declares Astro `>=7.2.6 <8`. The private repository and documentation workspace require Node `^22.22.3 || ^24.16.0 || >=26.3.0` to satisfy the documentation toolchain. The published adapter retains its separate Node engine range, `^22.18.0 || >=24.11.0`. Resolved dependencies are recorded in the monorepo's root `pnpm-lock.yaml`; generated projects use their own root workspace lockfile.

Agent endpoint routes and the content-loading approach come from that starter. The bilingual layout, navigation, search interface, examples and workspace checks are repoctl adaptations. These files are maintained locally; generating a project never downloads the upstream starter.

The local head component emits page-specific language metadata because the upstream head uses the site-wide locale. Client scripts are emitted as external assets so Astro does not inline them before Vite finalizes Pagefind's dynamic import.

The package version and starter tag were checked against published package metadata. `nimbus.json` records the reviewed package API baseline. The original full starter was not copied wholesale, so upstream starter diffs are not a claim that every local file is an unmodified upstream component.

On 2026-10-09, the project reviewed Nimbus `0.17.0` and upgraded Astro to `7.3.8`.
The site uses `docsCollection()` and static output, has no OpenAPI collections or
project-local `skills/` folder, and owns no conflicting discovery routes. The
0.17 review requires no source migration for this layout. New discovery files
are framework-generated; the existing robots policy and project-owned UI stay
in place. `nimbus-docs migrate --yes --json` records the reviewed baseline.
The project-owned Shiki styles remain necessary for both system themes.

On 2026-10-13, the project reviewed Nimbus `0.18.0`. The migration dry-run
reported no required source migrations and eight optional reviews. The site
keeps its project-owned bilingual components and static `docsCollection()`
routes; it does not enable image zoom, math, heading attributes, nested llms
scopes or a version switcher. Existing discovery routes are framework-owned.
`nimbus-docs migrate --yes --json` recorded the new reviewed baseline after
that review. Build, discovery, search and language switching are covered by
the workspace validation recorded in `docs/dependency-review-2026-10-13.md`.

On 2026-10-15, the project reviewed Nimbus `0.18.1`. The official
`nimbus-docs migrate --dry-run --json` preview from the `0.18.0` baseline
reported no source migrations, review items or errors.
`nimbus-docs migrate --yes --json` recorded the reviewed `0.18.1` baseline.
