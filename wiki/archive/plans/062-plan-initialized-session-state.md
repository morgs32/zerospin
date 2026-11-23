# Collapse session activation into initialized session state

Status: Completed — 2026-10-07.

## Agreed behavior

1. Replace aggregate activation and its duplicated public fields with one canonical `state.initialized` object. Apply this directly to live, standalone, mock, and agent sessions. Service storage and server Repo activation remain outside this change.
2. Retain canonical declaration, acquired database/runtime, admitted IDs, and private decoded/encoded claims with precise declaration, database, and claims inference. Keep progress, status, telemetry, and persistence state beside the initialized object; derive authored names/models from its declaration.
3. Keep initialized-object identity through progress updates, replace it on every admission including reconnect with the same SQLite, and synchronously clear it before disposal. Commands and queued delivery compare the captured object before committing/sending. Retain transport generations for their separate socket replacement boundary.
4. Migrate shared React hooks and aggregate consumers directly. Shared hooks accept current aggregate and service shapes; aggregate claims snapshots remain stable by initialized-object identity. Delete old fields and activation APIs without aliases or a replacement registry.

## Implementation

1. Add `IInitializedAggregateSession` and its constructor; remove the activation constructor/type. Replace aggregate state readiness and resource/identity fields with `initialized` and update command preparation, evaluation, staging, guards, validation, and ID generation.
2. Migrate browser owners and live/standalone/mock/agent disposal, admission, delivery, and progress observers. Remove publication-only schema/lock-key work; standalone retains its local backup key calculation.
3. Migrate React, DevTools, Studio, SDK, and affected aggregate callers together; retain exact type inference and private admitted claims.
4. Add a focused Node/SQLite check and register it with Nx. Reconcile glossary and affected current session documentation after source verification. No persisted schemas change; no reset or migration is needed. This reversible cleanup does not require an ADR.

Planned hierarchy (`~` modify; `+` add):

```text
zerospin/
├─ ~ packages/   # session code, shared hooks, and affected consumers
├─ + packages/browser/checks/initialized-session.mjs
├─ + packages/react/checks/claims.mjs
└─ ~ wiki/       # plan and affected session documentation
```

## Verification

1. Check protected claims, canonical contract identity, readiness failures, synchronous staging, transaction rollback, and exact inference.
2. Check disposal/replacement invalidation before commit and queued delivery, including a replacement that reuses the database; ordinary progress must preserve valid work. Check React snapshot stability across progress and refresh on re-admission.
3. Restore declared dependencies and run scoped Nx library builds, lint, type checks, and the focused check for changed packages and migrated consumers. Library builds cover core/browser source omitted by their auxiliary type checks.
4. Check scoped formatting, review diffs and remaining aggregate activation references, then record outcome and archive this plan only after required checks pass.

## Outcome

Aggregate state now exposes one frozen `initialized` session, with precise declaration/database/claims types and private decoded/encoded claims. Duplicate flat fields and the activation constructor/type are removed. Ordinary commands and lifecycle-owned observers capture the initialized reference; progress preserves it, new admissions replace it, and disposal revokes it synchronously. Deferred readiness callbacks and queued delivery reject an obsolete reference. Agent acquisition keeps its own lifetime counter, while queued delivery no longer duplicates that counter; socket replacement still uses transport generations.

React, DevTools, Studio, and Explorer use the new aggregate shape directly. Shared hooks retain the current service shape. React caches detached claims by admission reference, including transformed Date claims. Standalone backup identity and all persisted schemas remain unchanged. Reconnect publication preserves current progress after synchronous claim encoding.

The mounted-session glossary entry and current aggregate initialization/command/delivery documentation describe the implemented model; the separate session activation entry is removed. No ADR was added for this reversible cleanup.

## Completed checks

1. Scoped library builds passed for Core, Browser, React, DevTools, SDK, and Studio, including their declared dependencies.
2. `pnpm nx run-many -t ts lint typecheck initialized-session:check claims:check -p @zerospin/core,@zerospin/browser,@zerospin/react,@zerospin/devtools,@zerospin/sdk,@zerospin/studio,explorer` passed all 31 scheduled tasks, including Explorer typecheck/lint and both focused checks.
3. The real WASM SQLite mock/agent check passed protected claims, exact inference, canonical contract selection, readiness, synchronous staging and rollback, release/replacement fences, readiness callbacks, progress retention, and actual queued WebSocket delivery with same-database replacement and disposal.
4. The mounted React check passed stable detached claims across progress, fresh claims after same-database replacement, uninitialized/disposal failures, unchanged service claims behavior, and exact claims/declaration/model inference.
5. Scoped formatting, `git diff --check`, and live-source removal searches passed. Documentation validation checked 190 source hashes/ranges, 183 citation ranges, eight sequence/annotation pairs, Explorer IDs/edges, and 501 local links without new errors. Seven unrelated broken AuthoredSystem references already present in HEAD remain outside scope.
6. Nx Cloud reported its existing workspace authorization error (`401`) after successful local results; local checks exited successfully.

## Remaining work

None.
