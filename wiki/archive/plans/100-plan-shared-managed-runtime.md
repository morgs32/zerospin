# Shared ManagedRuntime and explicit DO composition

## Agreed behavior

1. Expose the one makeConfig-owned runtime as config.managedRuntime; remove config-level execution functions and pass the same runtime through server-side factories and helpers.
2. Replace its runSync on the original instance with typed synchronous Exit capture, interruption of AsyncFiberError fibers, and native outcome propagation. Do not explicitly flush or synthesize a runtime error. Leave other runtime methods native.
3. Require explicit DurableObject or PartyServer class composition. Preserve inherited instance capabilities, alarms, registration, activation gating, bootstrap, and schema policies.
4. Move migratable runtime ownership out of schema configuration and into factory construction. Preserve generic service and acquisition-error types in queues.
5. Recognize native AsyncFiberError at existing synchronous domain boundaries; preserve domain refusals, codec isolation, and transactions.
6. Remove duplicated static configurations and getter walkthroughs; narrow service fanout rows to IServiceResult.
7. Preserve unrelated WIP, browser/native session APIs, storage schemas, and archived historical documentation. Add no tests, fixtures, or runners.

## Planned hierarchy

`~` denotes modifications to existing files; directory entries group related callers.

```text
zerospin/
  packages/core/src/system/
    ~ types.ts
    ~ ZerospinConfigSchema.ts
    ~ make/makeConfig.ts
  packages/system-worker/src/
    ~ makeDORepo/, makeFixedDORepo/, makeMigratableDORepo/
    ~ makeOutboxQueue/, makeFanoutQueue/, makeOutboxSubscriber/, makeFanoutSubscriber/
    ~ aggregateSessionRepo/, aggregateSessionChain/, asyncOperations/, makeRpcApi/
    ~ Aggregate*, Service*, SystemRepo/, SystemLogRepo/, SystemLogAgent/
  wiki/
    ~ patterns/system-worker/repo-lifecycle.md
    ~ architecture/ (current runtime references)
    ~ archive/plans/098-plan-annotated-functions-and-api-telemetry.md
```

## Verification and documentation

1. Run scoped core/system-worker Nx lib and lint, then SDK/CLI/development/production consumer compilation.
2. Use disposable in-memory probes for synchronous success/failure/defects, interruption and native AsyncFiberError, no interruptible continuation, one runtime identity, acquisition reuse/failure, disposal, and config schema rejection of the old shape.
3. Review inherited typing/alarms and activation ordering. Search for removed execution wiring and wrapper recognition.
4. Reconcile current docs and patterns. No domain terminology is introduced; no glossary entry or ADR is warranted for this reversible wiring change.
5. Archive only after implementation and required verification are complete.

## Outcome

Completed on 2026-10-10. Config exposes its original managedRuntime instance with interrupting runSync and native remaining methods. Server factories and helpers pass that object consistently. Required class composition preserves inherited instance capabilities and alarms; runtime wiring is removed from migratable schema configuration. Existing domain refusal mappings and SQL boundaries are retained. Fixed/migratable wrappers attach their static configuration to the common class without duplicating instance declarations. Adapted fanout readers expose their actual row type and are required when physical rows do not satisfy that representation.

1. Nx lib passed for @zerospin/core, system-worker, @zerospin/sdk, @zerospin/cli, @zerospin/dev-worker, and @zerospin/production-worker, including required dependency builds.
2. Nx lint passed for core and system-worker with no errors or warnings introduced by this change. Ten unrelated system-worker WIP warnings remain: one unused variable in SystemRepo initialization and nine curly-brace warnings in materialization procedures. Nx Cloud reported an access warning; local task execution succeeded.
3. Disposable in-memory probes passed config identity/shape, strict old-shape rejection, lazy and reused acquisition, synchronous success/typed failure/defects, native AsyncFiberError with no interruptible post-suspension continuation, acquisition failures in runPromiseExit, and disposal finalization.
4. A disposable probe of the actual transpiled common factory passed supplied-class inheritance, inherited capability/alarm dispatch, synchronous identity/database initialization, derived-field activation gating, registration/schema/bootstrap/marker ordering, cold reopen, and stub lookup. This is a factory-boundary probe, not a live Cloudflare deployment test.
5. Scoped formatting and diff whitespace checks passed; removed wiring and wrapper-specific recognition are absent from active code and guidance. Browser/native session APIs, schemas, unrelated WIP, and archived historical documents were preserved. No test files, fixtures, or runners were added.
6. Current module documentation, runtime patterns, architecture descriptions, and active plan references were reconciled. No new domain term or qualifying ADR decision was introduced.

## Remaining work

None.
