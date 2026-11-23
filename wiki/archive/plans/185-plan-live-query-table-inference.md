# 185 — Automatic live-query dependencies and savepoint notifications

Status: Implemented and verified on 2026-10-15. The additional native wiring repair was explicitly approved in chat; all required checks pass.

## Agreed behavior

1. Browser and native live queries infer physical table reads from SQLite authorizer callbacks during preparation and automatic repreparation, including empty query results.
2. Remove the manual live-query `tableNames` API and update all in-scope callers and documentation. A successful zero-table read never becomes a wildcard subscription.
3. Publish notifications only for retained writes: rollback to a savepoint restores its changed-table snapshot, release retains writes, and root rollback preserves earlier undelivered committed notifications.
4. Preserve synchronous execution, SQL-publication-before-table-notification ordering, reentrant observer isolation, React effect ownership and existing terminal session errors.
5. Complete the approved native wiring repair: capture the admitted Node identity for handoffs, share the command-origin map with the receiver, retain authoritative admission environment, and connect the existing reset callback.

## Files and ownership

Legend: `+` create, `~` modify.

```text
zerospin/
├── packages/core/src/drizzle/
│   ├── ~ types.ts
│   ├── ~ make/makeInMemorySQLite3/makeInMemorySQLite3.ts
│   └── ~ README.md
├── packages/live-query/ — ~ query store and README
├── packages/react/ — ~ hooks, README and consumer skill
├── packages/devtools/src/ — ~ diagnostic hook and direct callers
├── packages/studio/src/AgentPreview.tsx — ~ query callers
├── packages/native/src/
│   ├── ~ openNativeSqlite.ts — synchronous bridge
│   ├── ~ createAggregateNativeSession.ts — admitted handoff and reset wiring
│   └── ~ openAggregateNativeNodeOwner.ts — authoritative admission environment
├── packages/swift/Sources/Zerospin/SQLiteHost.swift — ~ native read/write observation
├── fragment/content/ — ~ query guide and React reference
└── wiki/
    ├── + archive/plans/185-plan-live-query-table-inference.md
    └── ~ research/live-query-table-inference.md
```

## Implementation and verification

1. The shared client exposes synchronous `captureReadTables`. Adapters restore nested collection state and suspend attribution while delivering table listeners.
2. SQLite supplies dependencies and savepoint operation/name metadata. Each successful live read replaces its watched set. Failed diagnostic reads retain their prior set.
3. Adapter savepoint snapshots separate pending writes from already committed, undelivered names. Apply control metadata only after successful execution; `EXPLAIN` never changes observation state.
4. Verify with inline/stdin probes and existing checks only; create no test, fixture, runner or configuration files. Cover the unchanged checkout relation query, unrelated commits, nested/duplicate savepoints, rollback/release, zero-table reads, observer isolation and native host integration.
5. Run the scoped Nx package build/type/lint graph and actual Swift build, then reconcile the research note and archive this plan. Existing unrelated work is preserved.

## Completed evidence

1. Actual Shopping model declarations, unchanged relational query and production Drizzle/live-query code passed empty-result inference, all three dependency reruns, unrelated commit silence, raw savepoint rollback and nested Drizzle rollback.
2. Browser inline probes passed nested/duplicate savepoints, retained pre-savepoint writes, prior committed notifications surviving later rollback, `EXPLAIN` controls, whole-table DELETE and isolated schema-DROP classification during automatic repreparation. Final review of the corrected reprepare block found no remaining issue.
3. Actual Swift source and JavaScriptCore plus the native bootstrap/adapter passed read dependency and observer-isolation probes. Swift host probes passed nested/duplicate savepoints, failed release, root rollback, prior committed delivery, whole-table DELETE, early RETURNING finalization and schema DROP/reprepare. No verification files were created.
4. The scoped Nx graph passed all requested library/build/lint work and the React/live-query/DevTools/Studio TypeScript checks. The native package typecheck initially identified missing session wiring; its explicitly approved repair now passes the complete native build/type/lint graph and nine dependency tasks. Logs: `/tmp/zerospin-live-query-gates.log` and `/tmp/zerospin-live-query-native-wiring-gates.log`. Nx Cloud code401 did not prevent local tasks.
5. Strict typecheck of `openNativeSqlite.ts` using the existing native compiler options passed. The existing `zerospin-swift:build` Nx task passed against final Swift source: `/tmp/zerospin-live-query-swift-build.log`.
6. Existing `scripts/verify-plan140.mjs` passed all eight contract runtime groups: `/tmp/zerospin-live-query-existing-contracts.log`. Source/manual-list searches and `git diff --check` passed. No tests, fixtures, runners or configuration files were created.
7. The existing `scripts/verify-session-identity.mjs` passed all six identity/recovery groups after the native repair: `/tmp/zerospin-live-query-session-identity.log`. Captured handoff identity is enforced by the existing Node acceptance gate; receiver reset invalidates the handoff epoch, clears the shared origin map, and withholds initialization until replay. Source review confirmed the native wiring matches these existing owners.

## Remaining work

None.
