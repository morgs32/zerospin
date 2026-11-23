# Zerospin packages through Nx and a local registry

Status: Implemented and verified — 2026-10-07.

Use **Nx Release + Nx-managed Verdaccio**, with a shared **3.0.0** baseline. Zerospin owns builds and releases; QRK installs packaged dependencies. Distribution stays local, and existing package names—including `system-worker`—remain.

QRK consumes the completed `3.0.1` release, which includes the declaration-export fix. The initial `3.0.0` artifacts remain unchanged.

## Phase 1 — Establish versioning and changelogs

1. Configure an explicit fixed release group containing the 19 distributable packages, including `fragment-ui` and `logger`. Exclude private applications and `sync`.
2. Replace Changesets with Nx version plans. Fold the two pending changesets into the initial `3.0.0` release notes, avoiding an accidental subsequent major bump.
3. Use standard patch/minor/major semantics. Preserve internal `workspace:*` dependencies in source; packing converts them to concrete versions.
4. Make version-plan files trackable despite the existing `.nx` ignore rule. Replace automatic external publication with release validation in upstream CI.
5. Keep Git commits, tags, pushes, and publication separate from version/changelog generation.

```sh
# Preview the initial release without publishing.
pnpm release 3.0.0 --first-release --dry-run

# Subsequent changes record their bump and changelog text.
pnpm nx release plan patch --groups zerospin --message "Describe the change"

# Generate version/changelog changes without staging, committing, tagging,
# pushing, or publishing. Preview first, then write the reviewed result.
pnpm release --dry-run
pnpm release
```

**Gate:** disposable-workspace checks produce `3.0.1`, `3.1.0`, and `4.0.0` correctly, with aligned internal dependencies and changelogs.

## Phase 2 — Make packages independently installable

1. Make `logger` distributable and declare its runtime dependency on `error`.
2. Include Studio’s nested compiled runtime files in its package. Preserve intentional TypeScript source exports in Core and `system-worker`.
3. Export backup-worker assets as `@zerospin/backup-worker/backup-worker.js` and `/wa-sqlite-async.wasm`.
4. Derive the existing SDK version export from its manifest:

```ts
import packageJson from '../package.json' with { type: 'json' };

// Package metadata remains the authoritative release version.
export const ZEROSPIN_SDK_VERSION = packageJson.version;
```

5. Build the release package graph using existing Nx tasks. Add a `verify-release` task checking packed dependency versions, exported files, worker bundles/WASM, and React’s compiled JS/CSS.

**Gate:** packed artifacts contain their required runtime files; the browser worker’s exported version matches its bundle/WASM hash after the complete build and publishing lifecycle. Change build scripts only where verification demonstrates a failure.

## Phase 3 — Run and populate the local registry

1. Add Verdaccio upstream and configure Nx’s built-in registry executor. Pin Verdaccio to `6.3.2`: the installed Nx 23.1.0 executor resolves `verdaccio/bin/verdaccio`, which later Verdaccio versions hide behind their package exports.

```jsonc
{
  "executor": "@nx/js:verdaccio",
  "options": {
    "port": 4873,
    "listenAddress": "127.0.0.1",
    "location": "none", // Registry routing belongs to project configuration.
    "clear": false, // Retain previously released versions across restarts.
    "storage": "tmp/local-registry/storage",
    "config": ".verdaccio/config.yml",
  },
}
```

2. Serve `@zerospin/*` and `system-worker` locally without proxying those names to npm. Proxy ordinary third-party dependencies to npm.
3. Configure localhost as Nx’s default publication destination. Keep registry startup and publication uncached; retain caching for build artifacts.
4. Verify the registry actually serves port `4873`, then preview and publish the selected packages there:

```sh
# Inspect publication before writing to the local registry.
pnpm nx release publish --groups zerospin --registry http://127.0.0.1:4873/ --dry-run

# Publish the verified release locally.
pnpm nx release publish --groups zerospin --registry http://127.0.0.1:4873/
```

**Gate:** restarting the registry preserves `3.0.0`, and a clean consumer installs the complete dependency graph. Changed artifacts receive a new version rather than replacing an existing release.

## Phase 4 — Cut QRK over and verify

1. Replace Zerospin workspace dependencies with exact `3.0.1` dependencies. Add Studio’s missing direct backup-worker dependency.
2. Track credential-free project registry configuration and regenerate the lockfile. Route QRK through Verdaccio so the existing unscoped `system-worker` resolves correctly.
3. Replace hardcoded vendor asset paths with exported package resolution, preserving existing public worker/WASM URLs.
4. Move the required `sql.js` patch into QRK’s own `patches/` directory and preserve its effective patched version.
5. Remove vendored workspace globs, dependency overrides, TypeScript references, toolchain wiring, and finally `vendor/zerospin`.
6. Run scoped typechecking, lint, builds, existing backend integration checks, and manual browser checks. For Library, use only typechecking, lint, build, and manual checks.
7. Update installation and release documentation, affected vendor guidance, and the implementation record. Document fresh-checkout bootstrap and archive the completed plan.

**Gate:** all five apps start successfully, the existing page opens, worker/WASM assets load, and QRK builds leave installed Zerospin artifacts unchanged. A fresh frozen-lockfile installation succeeds against the populated registry.

Fresh installations require a running registry containing the locked release. Hosted distribution and deployment-machine bootstrap remain a later phase.

## Implementation record

1. Configured the explicit 19-package fixed `zerospin` release group and applied the `3.0.0` baseline using Nx Release. Removed Changesets and its publication workflow; retained both pending descriptions once in the initial workspace changelog. Version plans are trackable and CI invokes release versioning and packed-artifact validation.
2. Version/changelog generation uses Nx's programmatic APIs through `pnpm release`. This preserves the separate Git/publication boundary: Nx 23.1.0's top-level release command unconditionally stages consumed plan deletions even when `stageChanges` is false.
3. All 18 distributable library builds passed in one Nx graph. The new packed-artifact verifier passed for all 19 packages at `3.0.0`, including internal dependency versions, exports, runtime import graphs, Studio nested files, SDK manifest version, compiled React JS/CSS, and worker/WASM hashes. No existing build-script change was needed.
4. QRK's source/config cutover preserved its Library/Studio UI and README work. Initial frontend/API builds, lint, and 70 API integration tests passed; final installed-release and runtime results are recorded below.
5. Phase 1's three independent real-write rehearsals passed: all 19 package versions and packed internal dependency versions match `3.0.1`, `3.1.0`, and `4.0.0`; changelogs contain each message once; plans are consumed once; a second generation with no plans leaves the result unchanged; private manifests, commits, tags, and Git index stay unchanged. Root frozen-lockfile installation and the changed packages' scoped typechecking/lint also passed.
6. Published all 19 packages at `3.0.0` to the verified localhost registry. Restart preserved every published tarball byte and integrity value. The verifier then downloaded the actual published tarballs and passed the complete artifact/lifecycle checks without rebuilding or repacking source.
7. The wired Nx artifact task, clean consumer installation, fresh frozen-lockfile installation using QRK's pinned pnpm 10.33.0, and duplicate-version rejection passed. The rejected modified `3.0.0` publication left the original tarball unchanged.
8. QRK backend typechecking exposed SystemWorker's implementation-source type exports to the consumer's narrower compiler configuration. Pointed only its type conditions at packed declarations, preserving all intentional TypeScript runtime exports. Generated the aligned `3.0.1` release through an actual Nx patch version plan; all 19 rebuilt artifacts passed. Changelogs omit commit references because generation precedes Git operations.
9. Previewed and published all 19 `3.0.1` packages locally, then verified their downloaded published tarballs. Both releases remain available; every initial `3.0.0` tarball's integrity, URL, byte length, and SHA-512 still match the saved snapshot (19 unchanged tarballs, 3,133,657 bytes). Root frozen installation, script lint, syntax checks, and scoped formatting passed.
10. The final wired versioning gate passed patch/minor/major rehearsals with the completed changelog configuration. Its disposable baseline resets both package versions and changelog history, so existing real release entries cannot collide with rehearsal versions.
11. Installation and release workflows are documented in the producer and consumer READMEs. This changes release tooling and package distribution, without introducing a domain term or a decision meeting all three ADR criteria (hard to reverse, surprising without context, and a real trade-off); no glossary or ADR addition is warranted.
12. QRK's final `3.0.1` graph passed 20 tasks across Library, Studio, API, backend, Web, and Scraper, including 85 Workerd tests in seven files. Library checks were limited to typechecking, lint, and builds. Builds changed zero of 4,056 installed package files across 24 peer variants. Runtime verification exposed a fresh-resolution mismatch between QRK's pinned Effect `rc.112` and the CLI's platform package `rc.118`; QRK now pins `@effect/platform-node-shared` to `4.0.0-rc.112`, restoring its prior lockfile pairing and satisfying that package's declared Effect peer. After reinstall and restart, the backend accepts its system spec on port `8788`.
13. The corrected lockfile passed a fresh frozen installation using pnpm `10.33.0`, with byte-identical lock SHA-256 `5a6747491449bab4559aa1c759158c6c75bf4fe24c4f41d63c4dd6cb6b08a247`. All six public worker/WASM asset endpoints returned HTTP 200 and matched installed bytes. Browser checks correctly rejected retained pre-cutover backend commands and Library SQLite backup schemas. Stopped the dev process and moved only the backend system's persistence directory into `.wrangler/zerospin/backups/pre-nx-package-cutover-20261007T195056Z`, then restarted normally with empty storage. No old data was deleted or decoded through compatibility code; existing browser data remains preserved.
14. All five apps run from the installed release: Web `3000`, Studio `3001`, Library `4100`, API `8787`, and Zerospin backend `8788`. Frontend HTTP checks returned 200; the API returned its expected 405 for GET `/upload`; backend GET `/` returned its expected POST-or-WebSocket 400, while system-spec admission and session RPCs returned 200 and the command socket upgraded with 101.
15. The signed-in dashboard at `localhost:3000/morgs32` renders its current empty-site state: authentication verified, session current, local data available, synchronization online, no blocked work, rejection, or failure. Library at the fresh `qrk-package-cutover.localhost:4100` origin renders its grid and initializes its standalone session with a ready backup and no failure; Chrome's observed SQLite WASM response is 200. The absent old brick redirects to the fresh grid as expected. Existing Chrome login and legacy origin data remain preserved. Post-runtime comparison found zero changed installed package files across all 4,056 files and 24 peer variants.
16. Archived this plan after all required gates passed, including scoped formatting and diff checks in both repositories. The registry and five-app dev command remain running in root-owned sessions. Local Nx tasks passed; the existing Nx Cloud 401 affects remote reporting, not these local results. Hosted distribution and deployment-machine bootstrap remain outside this completed local-release scope.
17. Consolidation verification restarted the registry and five apps from the canonical `main` checkouts. All 19 published `3.0.1` artifacts passed again; all five HTTP checks returned their expected statuses, all six public backup assets matched package exports, the dashboard session was current and online, and Library's backup was ready without failure. All 4,056 installed package files remained unchanged. Final package work and the preserved QRK UI work were committed separately on local `main`.

## Remaining work

None.
