# Explorer RPC catalog caching and background watch

## Status

Superseded in development by [Plan 076](076-plan-explorer-source-scope-outlines.md) on 2026-10-09. Its worker affinity, dependency validation, atomic cache writes and watcher lifecycle are retained. Source-first outlines and individual call/owner requests replace the eager development catalog and `useRpcCatalog`; static builds retain complete graph generation with lazy data assets. The pending visual verification below is resolved against that replacement. Historical implementation and measurements remain recorded here.

## Approved behavior

1. Keep `pnpm nx run explorer:dev` as the single command. Feed managed analysis workers from Vite's existing watcher, without blocking development startup.
2. Use two workers, bounded by available CPU parallelism, with at most one retained ts-morph Project per worker. Preserve deterministic package-order merging and source-only module resolution.
3. Persist dependency-aware package results and complete catalogs in `.nx/cache/explorer-rpc/`. Validate input contents, inventory, configuration, manifests, lockfile, analyzer implementation and compiler versions. Cache corruption regenerates; unchanged restarts perform no analysis.
4. Mark RPC results unavailable immediately on changes, debounce work for 80 ms, reject superseded analysis and verify fingerprints before publication. Recover after failed analysis and clean up workers on shutdown.
5. Show loading, ready and error states through asynchronous reads and Vite HMR events. Preserve RPC navigation and search. Decouple Invocation source viewing from RPC analysis. Production builds require a complete fresh catalog.

## Implementation

1. Extract the Vite plugin and split package project construction, analysis and deterministic merging. Add the worker pool, cache and generation lifecycle.
2. Update the virtual modules, RPC loading hook and source viewer, preserving concurrent Explorer and Vite+ edits.
3. Cover parallel equivalence, cache reuse/invalidation, retained Projects, rapid changes, failure/recovery, independent page availability and shutdown. Run scoped Nx checks and verify development/production preview.
4. Record startup, regeneration and memory measurements against the observed 56.9-second startup. Update Explorer documentation and reconcile existing glossary terminology. Create an ADR only for an implemented decision meeting all repository criteria, then archive this plan.

Planned tree (`+` create, `~` modify):

```text
explorer/
├── scripts/
│   ├── ~ rpc-call-tree.mjs, rpc-call-tree.d.mts, rpc-call-tree.test.mjs
│   ├── + rpc-catalog.mjs, rpc-catalog.d.mts, rpc-catalog.test.mjs
│   ├── + rpc-analysis-worker.mjs
│   └── + rpc-vite-plugin.ts, rpc-vite-plugin.test.mjs
├── src/
│   ├── ~ env.d.ts, data/rpc-types.ts
│   ├── ~ components/source-viewer/loadSourceFile.ts
│   └── views/rpc/
│       ├── ~ Rpc.tsx
│       └── + useRpcCatalog.ts
└── ~ vite.config.ts, package.json, README.md
```

## Implemented outcome before Plan 076

1. `rpc-call-tree.mjs` exposes package discovery, Project construction, analysis and deterministic merging. The worker pool owns at most two live Projects, schedules retained packages first and resolves refreshed imports and triple-slash references. Installed declaration contents or resolution manifests recreate affected Projects.
2. `rpc-catalog.mjs` validates complete catalogs and package shards against source contents/inventory, actual compiler Program dependencies, installed package manifests, inherited configuration, installation metadata, lockfile, compiler versions and analyzer implementation. Writes replace JSON atomically. Generations recheck inputs before caching and publication, discard superseded results and recover after analysis/worker failure.
3. `rpc-vite-plugin.ts` starts development analysis asynchronously, owns watcher/worker cleanup and exposes asynchronous snapshot reads plus custom HMR invalidation/reconnect events. Production awaits fresh analysis and embeds the catalog and referenced-source assets. Invocation source URLs remain available independently while RPC analysis runs.
4. `useRpcCatalog.ts` models loading/ready/error and rejects stale requests. The existing RPC owner view preserves selection/search/URL while refreshing, clears stale source dialogs and receives only fresh catalogs. Concurrent Vite+ and Explorer presentation work is preserved.
5. Explorer run/source documentation and the existing RPC method catalog glossary entry describe the implemented lifecycle. No ADR was created: this tooling/cache decision is readily reversible and does not meet all three ADR criteria.

## Verification evidence

1. `pnpm nx run-many -t rpc:check build check -p explorer` passed on the final implementation: 25 RPC tests, production build, formatting, lint with no warnings and TypeScript diagnostics. `pnpm nx run explorer:test:diagrams` passed all 5 diagram tests. Nx Cloud returned an access error (401); local tasks succeeded.
2. Tests compare parallel/direct analysis, duplicate owners, inherited methods, cross-package paths and real production paths. They cover zero-job warm reuse, corrupt caches, affected-package invalidation, imported helpers, declarations, installed dependency contents/manifests, inventory/configuration changes, retained Project refresh, affinity scheduling, superseded completions, failure/recovery and shutdown.
3. Real Vite fixture integration deliberately delays analysis and verifies independent HTTP pages and Invocation sources, unavailable RPC sources while updating, custom HMR events without catalog-triggered reloads, and fresh production embedding/source assets.
4. At the end of this implementation, development/preview on ports 3040/3041 and HTTP source checks passed, while browser rendering was blocked by a URL-policy rejection. That eager-catalog view was subsequently superseded. On 2026-10-09, Plan 076 verified the replacement `AggregateBrowserSessionApi.accept` view in both modes, including lazy expansion, search/history, source text and Escape dismissal. Invocation renders and its preset guard/source dialog work independently in both modes. Scoped update/reconnect behavior is covered by the replacement Vite integration fixtures. No manual user verification remains pending.
5. Scoped `git diff --check` passed. Changes preserve concurrent Explorer presentation, architecture documentation, SystemApi and Vite+ work.

## Performance measurements

Measured on 2026-10-08 with Node 24.13.1 and two workers. The source-copy benchmark uses the same five workspace package programs and installed dependencies, with a separate cache; it changes only a temporary copy of `SystemApi/healthcheck/healthcheck.ts`. RSS includes the analysis worker threads and is sampled every 100 ms. Catalog preparation excludes process launch and the 80 ms edit debounce.

| Measurement                                            | Preparation | Analysis jobs | Retained Projects reused |                           Peak RSS |
| ------------------------------------------------------ | ----------: | ------------: | -----------------------: | ---------------------------------: |
| Cold source-copy catalog                               |     38.40 s |             5 |                        0 |                          4,212 MiB |
| Shared source edit on the live pool                    |     37.88 s |             5 |                        2 |                          5,682 MiB |
| Complete-cache read after disposal, same process       |      0.51 s |             0 |                        0 |                     See note below |
| Fresh Explorer development launch with validated cache |      1.24 s |             0 |                        0 | 305 MiB sampled by catalog metrics |

The previous observed startup was 56.9 seconds. Cold catalog preparation is about 32.5% shorter than that baseline; the measurement boundaries differ because development startup now proceeds independently of analysis. The shared healthcheck file invalidates all five package programs, so its regeneration remains expensive despite reusing two Projects. Smaller fixture edits demonstrate reuse of unaffected package results. Warm acceptance is satisfied by zero analysis jobs. The same-process warm measurement retains allocator RSS from earlier analysis and is not a fresh-process memory measurement. No prior startup RSS was recorded for a memory comparison.

## Remaining work

None. Superseded development behavior and the completed replacement verification are recorded above and in Plan 076.
