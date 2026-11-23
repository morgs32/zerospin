# Aggregate staging fixture

Status: Complete — 2026-10-07.

## Agreed work

1. Add an executable `stageAggregateCommand` example under `packages/browser/src/fixtures/`, using an initialized aggregate session and in-memory wa-sqlite.
2. Verify synchronous success, the optimistic resource row, retained pending command and operation. Verify a guard rejection leaves committed state unchanged.
3. Add `pnpm nx run @zerospin/browser:aggregate-staging:check`, following the existing fixture runner convention.
4. Run the fixture with its dependency builds, scoped lint and formatting checks. Reconcile documentation; this example introduces no domain terms or governing architecture decisions.

## Outcome and verification

1. `packages/browser/src/fixtures/aggregateStaging.ts` initializes an empty aggregate session projection in real wa-sqlite, then calls `stageAggregateCommand` synchronously for `createItem`.
2. The example asserts the contract result, immediate optimistic row, retained pending command and applied operation. A duplicate item receives `item-exists` and leaves the resource, command and optimistic operation rows unchanged. Cleanup disposes the runtime and closes SQLite.
3. `pnpm nx run-many -p @zerospin/browser -t aggregate-staging:check lint` passed, including the Browser TypeScript build and its required dependency builds. Formatting and `git diff --check` passed. Nx Cloud reported workspace access code 401 after successful local checks.
4. The executable file documents its dedicated Nx command. Existing domain terms and governing architecture decisions remain sufficient; no glossary or ADR changes are required.

## Remaining work

None.
