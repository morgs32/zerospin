# Simplify aggregate-session readiness

`state.initialized !== null` means an aggregate session can execute local commands. Lifecycle owners retain resources privately during preparation and recovery, and publish them only while execution is permitted.

## Implementation

1. Integrate completed plan 062's single-initialized cutover. Replace the aggregate current-session checker and redundant retrieval helpers with `getInitializedSessionOrThrow({ session })`, returning the canonical initialized object or `aggregate-session-not-ready`.
2. Delete aggregate `sessionStatus`, expected-object arguments, and command-level identity checks. Each command entry reads readiness once. Preserve existing guard/result behavior and service-session status.
3. Ordinary browser owners publish after admission/restoration when the Node permits execution, withdraw on blocking conditions, and republish on recovery. Offline operation remains usable. Agent owners publish only after replay completion. Standalone owners revoke publication before ownership loss, reset, or disposal, then publish a fresh object on reacquisition.
4. Keep initialized identity stable across progress. Keep real asynchronous callback fences inside lifecycle/transport owners. At both aggregate commit entrypoints, check for null at transaction entry and before completion, rolling back disposal during encoding. Add no lease or execution lock.
5. Migrate aggregate React, Studio, DevTools, mocks, and affected callers. Resource-dependent hooks are unavailable while initialized is null; no stale public database view.

## Verification

1. Extend actual SQLite/browser checks for preparation, replay, blocking/recovery, offline use, ownership loss/reacquisition, disposal in program/codec, and obsolete asynchronous callbacks.
2. Extend React subscription checks for resource unavailability and republishing; preserve precise model/claims/contract inference.
3. Run scoped Nx library builds, types, lint, behavioral checks, formatting, and affected consumer checks. Remove expected-object-only tests.
4. Reconcile glossary and affected lifecycle documentation after implementation. Create an ADR only for an implemented decision meeting the repository's criteria. Archive after required verification.

## Planned hierarchy

`~` modifies existing files; `+` adds files. Delete superseded helper files outright.

```text
zerospin/
├── packages/core/src/aggregateSession/    ~ types, commands, transactions; + getter
├── packages/core/src/agent/               ~ staging
├── packages/browser/                     ~ lifecycle owners and checks
├── packages/{react,studio,devtools}/      ~ aggregate consumers and checks
└── wiki/                                 ~ glossary and lifecycle documentation
```

The earlier contract-guard construction proposal is outside this plan. No persisted schema change or storage migration is required.

## Outcome

Integrated the completed single-initialized cutover from recoverable Git snapshot `8359e554428fd86cef1dbb9382a69e9bc71cb2f2`, whose parent is this checkout's original HEAD. Aggregate `sessionStatus` and the current-session/reference-checking helper are deleted. The canonical getter returns the precise initialized object or a typed readiness failure. Command entrypoints read readiness once; both commit entrypoints check null publication at transaction entry and completion.

Browser owners retain preparation and recovery resources privately, publish only when execution is permitted, and revoke publication before asynchronous cleanup. Ordinary offline sessions remain executable. Agent reconnect preserves pending optimism privately and publishes after replay; standalone ownership loss and backup failure withdraw publication, with fresh publication after reacquisition or reset. Asynchronous owners retain their actual stale-callback fences. Studio's redundant readiness prop is removed; React and DevTools use initialized publication directly. Service status, persisted schemas, and contract guard/result semantics are unchanged.

Updated the mounted-session glossary, affected lifecycle documentation, and Explorer's invocation workflow. This cleanup is reversible and needs no ADR.

## Completed verification

1. `pnpm nx run-many -t lib ts lint typecheck initialized-session:check claims:check -p @zerospin/core @zerospin/browser @zerospin/react @zerospin/devtools @zerospin/sdk @zerospin/studio explorer` passed all 31 tasks, including declared dependencies.
2. The SQLite/browser fixture passed private preparation, protected claims, canonical contracts, exact getter/model/claims/payload inference, synchronous staging, rollback on program/codec disposal for both commit paths, blocked Node recovery, permitted offline use, queued Node revocation/recovery/disposal, standalone ownership loss/reacquisition, backup failure/reset, and obsolete agent socket/queued-push rejection across actual reconnect.
3. The mounted React fixture passed stable detached claims, unavailable resource gates during recovery, republishing with fresh claims without restarting lifecycle ownership, disposal, unchanged service behavior, and exact session/model/claims inference.
4. After final Explorer source-citation updates, its scoped lint/typecheck graph passed all 19 scheduled tasks.
5. Documentation checks passed 190 source hashes/ranges, 179 citation ranges, eight sequence/annotation pairs, and 397 Markdown links without new broken links. Eight preexisting broken links remain outside scope. Source-removal searches and `git diff --check` passed.
6. Nx Cloud reported the existing workspace authorization error (`401`); local task results exited successfully. Declared fixture dependencies were installed without unrelated manifest/lockfile changes.

## Remaining work

None.
