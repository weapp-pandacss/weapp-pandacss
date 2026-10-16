# Complete acceptance on one candidate commit

The approved acceptance flow has one owner and runs serially so framework builds, browser previews, development watchers and real IDE projects cannot overwrite each other's outputs. Existing individual test commands remain useful for diagnosis. The full command has no skip switches and treats missing credentials, browser payloads, minimum Node executables or IDE availability as explicit failures.

`e2e/acceptance.ts` verifies a committed candidate and records its SHA/tree and local-file digests. It runs frozen install, quality checks, packaging, repoctl doctor/full checks, dependency/catalog consistency, security comparison, packed consumers, Wevu, Web/H5/docs browsers and dev/watch tests. Each gate has an owned log and updates a result that starts as failed. Cancellation is forwarded to the active child; the child suite remains responsible for its scoped cleanup.

Security acceptance uses a separately reviewed baseline of GHSA identity, module, severity, affected versions and reachable dependency edges from every importer in the complete workspace lockfile. It does not use audit's bounded path list as a graph. New advisory identities, versions or dependency routes and higher severity fail even when aggregate counts are unchanged. Existing vulnerabilities remain visible. The runner cannot update its own baseline.

After the development/watch gate releases its processes, all four mini-programs are rebuilt once. The orchestrator hashes the complete fixture trees, then calls the unchanged single-round IDE runner twice with distinct absolute evidence directories and the expected candidate SHA. Each round must report successful assertions and cleanup; the candidate SHA and exact fixture digests are rechecked around both runs. No commit, push, publishing or deployment occurs inside the orchestrator.

Pre-commit verification uses individual gates and the single-round IDE entry. The final complete flow requires the reviewed implementation to be committed first. Its artifacts are retained outside tracked source and a failed prerequisite cannot be mistaken for a successful acceptance run.
