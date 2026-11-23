# Owned execution and program runner removal

Status: Complete — 2026-10-10.

## Problem and conversation review

1. Callers import `runProgram` to select synchronous execution while `makeConfig` already owns the server's ManagedRuntime. Shared contract evaluation, codecs, admission, browser initialization, and session rehearsal all repeat this choice.
2. The conversation's central conclusion is correct: an asynchronous method can call a synchronous execution method. `config.runSync(effect)` completes or throws before the surrounding asynchronous method continues. The surrounding method does not have to become synchronous.
3. The earlier claim that native `runSync` makes every inner check redundant was too broad. Installed Effect's `runSyncExitWith` returns an `AsyncFiberError` containing a still-running fiber; `runSyncWith` throws its squashed cause without interrupting that fiber. A replacement must interrupt suspended work and flush its dispatcher before returning control to rollback or failure handling.
4. This repository already has synchronous owners: `makeTx`, `withSavepoint`, aggregate/service materializer `captureEvaluation`, and aggregate session staging evaluation. Keep these actual execution phases. In particular, materializer evaluation captures suspension before savepoint failure handling so it can retain a failed command finalization. Relying only on the outer transaction runner would instead roll back the whole command as an infrastructure failure.
5. Shared contract evaluation must compose Effects rather than select an interpreter. Standalone SharedWorkers deliberately provide asynchronous SQLite reads and execute through `runPromiseExit`; nested `runProgram` currently rejects those reads. The local contract pattern already distinguishes synchronous tab/server evaluation from awaited standalone-worker reads. The glossary's unconditional synchronous-program wording needs reconciliation after implementation.
6. `config.runtime` is not required as a public ManagedRuntime. Server consumers use `runSync`, `runPromise`, and `runPromiseExit`; Repo factories unnecessarily require the entire ManagedRuntime. Exit-based execution is a real queue dependency and must continue to capture application-layer acquisition failures.

## Agreed direction and execution contract

1. `makeConfig` owns one private, shared ManagedRuntime and returns authored `system`, `systemId`, and execution functions directly. Replace `config.runtime.runSync` and `config.runtime.runPromise` with `config.runSync` and `config.runPromise`. Supply `config.runPromiseExit` to the existing queues that need full Exits. Do not introduce an additional public runner for each domain phase.
2. `config.runSync(effect)` performs synchronous execution with configured services, stops suspended fibers before exposing failure, and throws on unsuccessful execution. Map suspension to `program-must-be-synchronous`; preserve ordinary typed failures and non-suspension Causes using Effect's normal propagation. This root does not promise to resume a suspended inner catch or result handler.
3. `config.runPromise(effect, options)` permits suspension and retains the current ManagedRuntime success, failure, interruption, and execution-options behavior. `config.runPromiseExit(effect, options)` returns the complete Exit, including layer acquisition failure. Do not emulate it by merely running `Effect.exit(effect)` through `runPromise`, which would miss failure before the program starts.
4. Root execution functions must work when passed as callbacks, without a `this` requirement. Preserve current application-layer inference, constructor checks, authored object identity, lazy acquisition, and one-runtime reuse. Do not add session failure notifications to server config or introduce per-Repo runtimes, runtime warming protocols, or disposal APIs.
5. Classes and Worker entrypoints own config imports. Extracted procedures retain their Effect requirements and use `yield* System` where required. Pass narrow execution functions explicitly where an asynchronously orchestrated helper genuinely needs to invoke a synchronous phase. Never import application config into transaction or contract helpers. Where outer Effect orchestration consumes a synchronous phase, capture its completed Exit and handle a suspension throw outside the call before re-entering the domain failure channel; wrapping a throwing root in `Effect.sync` alone would turn a recognized refusal into a defect.
6. Shared contract helpers retain normal Effect composition, local operation sinks, scoped reads, failure normalization, result validation, and codec service isolation. Remove their choice of synchronous execution. `Context.empty()` isolation in result/failure codecs remains required even when their enclosing owner permits asynchronous execution.
7. Synchronous owners retain their observable failure semantics. Server materialization still records suspension as a terminal authored command refusal; validation still returns the recognized refusal; local staging still reports its existing recognized `StageFailure`; escaping defects retain their Cause and session reporting. A helper deletion must not turn one of these outcomes into an escaping root error.
8. Keep synchronous SQL transaction/savepoint execution independent of whether its enclosing root uses `runSync` or `runPromise`. Standalone worker evaluation retains its existing asynchronous ownership and serialized commit flow; do not force asynchronous SQLite reads into `makeTx`.
9. Delete `packages/core/src/execution/runProgram.ts` and all live callers after every caller has an enclosing execution policy. Do not retain an alias or recreate the same generic exported helper under another name. Private evaluation checks may remain at real phase owners that must capture a result before their caller's failure handling.

## Scope and alternatives

1. Include core config/schema/types, root execution consumers, shared authored contract evaluation and codecs, session evaluation owners, browser root cleanup, server admission/projection/producer phase orchestration, and affected documentation/Explorer call trees. Native sessions consume the shared session execution implementation; verify that consumer without redesigning native lifecycle.
2. Preserve unrelated current WIP. AggregateChain source, its README and architecture pages are already dirty. Archived plan 094 describes a preparation/retention separation that is not fully reflected by the current source. Re-read the current diff before implementing and adapt this cutover to the source that is actually present; do not silently implement or undo a different plan.
3. No fixed schema or persisted row format changes, compatibility fields, migration paths, cast exceptions, new test files, fixtures, test/check runners, or runner configuration. Existing Storybook stories and UI fixtures remain intact. Implementation follows the approved scope.
4. Rejected: rename root calls while keeping every nested check. This preserves redundant interpreters and continues rejecting standalone-worker reads.
5. Rejected: delete every check and trust outer `runPromise` or transaction execution. `runPromise` permits suspension; an outer synchronous runner cannot execute failure classification after an inner Effect has suspended.
6. Rejected: make all RPCs synchronous. Provenance acquisition, alarm holds, scratch database setup, external production, delivery, and waiting for results contain genuine asynchronous work.
7. Rejected: move the existing helper onto config and invoke it for each guard/program/codec. Config owns host execution; cohesive evaluation and SQL phases own their result/rollback policy. The refactor should reduce the decisions callers must make.

## Implementation steps

1. Re-read the scoped diff and inventory every `runProgram`, `config.runtime`, runtime-valued API constructor argument, and `managedRuntime` Repo-factory argument. Reuse the resolved Nx project configurations; inspect any additional consumer only if the changed type or import reaches it.
2. Implement the execution functions in `makeConfig`; change `ISystemConfig` to retain the three execution capabilities instead of `runtime`. Update `ZerospinConfigSchema` to validate callable capabilities without executing, binding, or copying authored functions/definitions. Keep full Exit handling and cancellation in the implementation rather than exposing the ManagedRuntime.
3. Narrow Repo-factory dependencies to the execution functions actually consumed and replace the `managedRuntime` argument with `execution`. Pass config's capabilities to fixed system Repos. Standalone migratable Repos can supply their own structurally compatible execution object, including an actual ManagedRuntime; its ownership remains with the caller.
4. Migrate system Repo classes, API constructors, Gateway wiring, SystemLogAgent, dev/production Worker entrypoints, and outbox/fanout callback dependencies. Preserve class-owned RepoServices provisioning, cold construction, activation, alarm recovery, RPC envelopes, and the existing layer-error type in Exit-based queue execution.
5. Add interruption and dispatcher flushing to the shared session synchronous root before defect reporting and rethrow. Preserve browser/native session lifetime lookup and existing failure event ownership. Keep the root's existing exception/Cause reporting; use domain phase owners, rather than the root, to retain recognized staging and validation refusals.
6. Remove `runProgram` from shared contract guards, input preparation, operation collection, base/mapper programs, and result/failure/external-response codecs. Preserve normal Cause composition and local service provisioning. Verify that standalone-worker reads now reach their existing asynchronous interpreter and commit path.
7. Retain materializer `captureEvaluation`, `makeTx`, `withSavepoint`, and aggregate session staging as the enclosing synchronous owners. Remove redundant checks beneath them. Keep materializer savepoint rollback, terminal refusal retention, cursor/finalization/outbox updates, ordinary typed rejection classification, and retryable escaping defects in their existing order.
8. Consolidate each session validation/service staging check around its complete owned evaluation phase before result recognition or `StageFailure` emission. Preserve the existing returned failure code and readiness/identity fences. This can be a private implementation of the existing domain interface; do not add a generic public interpreter. Remove repeated claims checks in browser/native initialization once root cleanup encloses them. Retain codec isolation and pending replay rollback.
9. Split server orchestration at actual asynchronous work. For ordinary/staged admission, acquire the outbox hold asynchronously, execute complete local preparation plus retention through the class-owned synchronous function, then schedule delivery. For async admission, acquire and verify provenance before that local synchronous phase. For direct execution, retain admission synchronously and then await the result asynchronously. Capture suspension outside the synchronous call and apply the existing mappings: ordinary/staged validation returns `aggregate-chain-command-invalid`; async validation passes through its existing `async-admission-failed` envelope. Inner Effect handlers cannot run after suspension, so relocate this classification with the execution seam. Preserve infrastructure retention failure mapping, duplicate-recovery sequencing, batch atomicity, and hold release on failure.
10. For projection staging and validation, keep scratch database acquisition asynchronous, then execute the complete evaluation synchronously before committing. Pass the execution capability from the Repo class and explicitly retain invocation services when starting the owned phase. Preserve the basis comparison, changed-basis retry, permit lifetime, scratch cleanup, rejection decisions, and no-emission guard semantics.
11. Supply synchronous codec execution to `makeAsyncOperations` from AggregateVersionRepo/ServiceVersionRepo class files. Decode frozen input synchronously, await the external request, then validate/encode its response synchronously before recording it. Retain producer retry/deadline/failure evidence, timeout behavior, and the atomic response/outbox transaction. Capture the owned phase outcome before existing failure handling; do not flatten composite Causes or change codec failures into unrelated infrastructure failures. Preserve `prepareAsyncOperation` coverage by its enclosing materializer evaluation.
12. Delete the generic `runProgram` implementation and its error-union references where the enclosing owner now supplies the policy. Keep `program-must-be-synchronous` in interfaces that can still return that domain refusal. Search all live source, exports, consumers, docs, and Explorer call-tree references exhaustively. Historical archived plans remain historical records.
13. After implementation, reconcile the local runtime/contract patterns, glossary, relevant READMEs, architecture source citations, and Explorer call trees with the actual owners. Create an ADR only if the implemented decision meets all three repository criteria; no new domain term or ADR is required merely for config's execution functions.
14. Complete the scoped verification below, record the result, set Remaining work to None, and archive this plan with its filename preserved. Use the implement workflow; keep the plan active if a required check fails or remains unresolved.

## Planned files

Legend: `+` create, `~` modify, `-` delete. Braces group explicitly named existing directories or files; directory entries include only the affected execution callers inside them.

```text
zerospin/
├── packages/core/src/
│   ├── system/{types.ts,ZerospinConfigSchema.ts,make/makeConfig.ts}       ~
│   ├── execution/runProgram.ts                                         -
│   ├── sessionExecution/makeSessionExecution.ts                         ~
│   ├── contracts/{runContractGuard.ts,prepareContractInput.ts,           ~
│   │              resultCodec.ts,failureCodec.ts,externalResponseCodec.ts}
│   ├── contracts/make/makeOperations.ts                                ~
│   ├── aggregateSession/{makeInitializedAggregateSession.ts,             ~
│   │                     validateAggregateSessionCommand.ts,
│   │                     replayPendingCommandsTx.ts,stageCommand/}
│   └── serviceSession/{stageServiceSessionCommand.ts,                    ~
│                       validateServiceSessionCommand.ts,
│                       replayPendingServiceCommandsTx.ts}
├── packages/system-worker/src/
│   ├── {makeDORepo/,makeFixedDORepo/,makeMigratableDORepo/}              ~
│   ├── {AggregateChain/,ServiceChain/}                                 ~
│   ├── {AggregateVersionRepo/,ServiceVersionRepo/}                     ~
│   ├── {AggregateActorVersionRepo/,AggregateAgentVersionRepo/,           ~
│   │    ServiceActorVersionRepo/}
│   ├── {AggregateVersionChain/,AggregateActorVersionChain/,              ~
│   │    AggregateAgentVersionChain/,ServiceVersionChain/,
│   │    ServiceActorVersionChain/}
│   ├── {SystemRepo/,SystemLogRepo/,SystemLogAgent/}                     ~
│   ├── {SystemApi/,AggregateSessionApi/,ServiceSessionApi/,GatewayApi/}  ~
│   ├── {AggregateApi/,ServiceApi/,AggregateAccessApi/,ServiceAccessApi/} ~
│   ├── aggregateSessionChain/AggregateSessionChain.ts                   ~
│   ├── aggregateSessionRepo/{AggregateSessionRepo.ts,                   ~
│   │                         optimistic/,validateCommands/}
│   └── asyncOperations/{makeAsyncOperations.ts,prepareAsyncOperation.ts} ~
├── packages/browser/src/
│   ├── bootstrapServiceSession.ts                                      ~
│   └── makeBrowserSession/createAggregateAgentBrowserSession.ts        ~
├── packages/{dev-worker/src/DevWorker.ts,                               ~
│             production-worker/src/ProductionWorker.ts}
├── explorer/src/data/sequence-call-trees/{browserSteps.ts,serverSteps.ts} ~
└── wiki/
    ├── plans/095-plan-owned-execution-and-program-runner-removal.md     +
    ├── glossary.md                                                     ~
    ├── patterns/{system-worker/repo-lifecycle.md,                       ~
    │             contracts/contract-program-emission-and-result.ts}
    └── architecture/{AuthoredSystem.md,server/,browser/}                ~
```

1. Preserve `makeTx` and `withSavepoint` mechanisms; change those files only if removal of a caller's redundant code requires a narrowly scoped type adjustment. Do not redesign the SQL infrastructure.
2. Keep the existing materializer evaluation checks and their domain Cause wrappers unless a scoped cleanup can preserve their exact outcome classification. Do not replace them with config imports inside procedures.
3. The standalone worker and native lifecycle sources are verification seams. Modify them only if changing shared execution requires an actual wiring adjustment, not to impose server policy on them.

## Verification

1. Source-review root and phase ownership: no public ManagedRuntime on config, no config imports in extracted procedures, no shared contract interpreter, no suspended fiber left able to resume after a rejected synchronous phase, and no application services leaked into isolated codecs. Preserve local operation sinks and invocation-provided services when crossing an execution root.
2. Check synchronous success, ordinary typed failure, defect/composite Cause, interruption, and suspension handling at config/session roots and the existing SQL/evaluation owners. Explicitly review cancellation before rollback, command refusal retention after evaluation rollback, and refusal recognition before session result/event reporting. Compilation alone does not establish these behaviors.
3. Use existing permitted app/Storybook execution seams where available to check returned validation failures, local staging rollback and notification, server final failed-command retention, asynchronous standalone SQLite reads, and external producer response recording. Do not create tests, fixtures, or check runners. Report precisely which behaviors were executed versus reviewed in source.
4. Run one scoped Nx graph for library compilation and lint: `pnpm nx run-many -t lib lint -p @zerospin/core,system-worker,@zerospin/browser,@zerospin/dev-worker,@zerospin/production-worker`, preserving required dependencies. Include native/SDK or another consumer only when the changed source/type requires it. Confirm actual target options before execution.
5. Run the real `ts` source checks for changed system/browser/Worker projects and Explorer's `typecheck`/`lint` through Nx. `@zerospin/core:lib` performs real compilation; do not count a no-op or disabled inferred typecheck as evidence. Run scoped formatting and `git diff --check`. Reconcile architecture/call-tree citations through existing supported tooling where available.
6. Exhaustively search live files for removed `runProgram` imports/calls, `config.runtime`, superseded `managedRuntime` argument names, and stale callable/schema/type declarations. No compatibility aliases or new `ALLOWED_CAST` exceptions. Distinguish unrelated existing failures from in-scope issues.

## Implementation outcome

1. Config owns one private shared ManagedRuntime and returns authored identity plus `runSync`, `runPromise`, and `runPromiseExit`. Live config validation checks callable capabilities without copying or invoking them. Repos and APIs consume narrow execution capabilities; callback usage remains supported.
2. Shared contract guards, preparation, collection, mapper/base programs and codecs compose Effects. Result, failure and external-response codecs retain empty-context isolation. The generic `runProgram` file and every live import/call were deleted; no compatibility aliases, persisted schema changes, cast exceptions, test files, fixtures or runner configuration were introduced.
3. Session roots stop and flush rejected execution fibers before reporting defects. Validation and service staging retain private complete evaluation captures before recognition. Materializers retain their existing Cause wrappers and refusal finalization; async-emission preparation now occurs inside evaluation capture before savepoint failure classification. Transaction/savepoint mechanisms remain unchanged.
4. Admission retains invocation services across its class-supplied synchronous preparation/retention phase, with outbox holds and async provenance outside that phase. Suspension classification occurs after the root call. Projection scratch setup remains asynchronous; evaluation completes synchronously before basis comparison and commit. Producer input/response codecs complete synchronously around the awaited external request before response/outbox recording.
5. Updated live patterns, glossary, module READMEs and affected architecture narratives, source ranges and hashes. Concurrent Explorer work deleted its architecture/call-tree implementation while this change was running; those deletions were preserved rather than recreating removed files. Explorer checks passed after that work.

## Verification outcome

1. Passed `pnpm nx run-many -t lib lint -p @zerospin/core,system-worker,@zerospin/browser,@zerospin/dev-worker,@zerospin/production-worker` (15 tasks including dependencies). Core performed real compilation. Final log: `/tmp/095-build-lint.log`.
2. Passed `pnpm nx run-many -t ts typecheck lint -p system-worker,@zerospin/browser,@zerospin/dev-worker,@zerospin/production-worker,@zerospin/native,explorer` (28 tasks including dependencies). The real Worker/browser/native `ts` and Explorer `typecheck` targets ran; SDK and its required consumers compiled in the dependency graph. Final log: `/tmp/095-source-checks.log`.
3. Passed scoped Oxfmt checking and `git diff --check`. Exhaustive live source/pattern/architecture searches found no `runProgram`, `config.runtime`, superseded `managedRuntime` arguments, or old config runtime indexing. No new config imports entered extracted procedures. Existing lint warnings remain outside changed behavior; Nx Cloud authorization reports code 401 while local graphs succeed.
4. Executed direct calls to existing core modules without creating test or runner files: config authored object identity, lazy acquisition and one-runtime reuse; detached callback functions; ordinary typed error identity; defect identity; composite Cause/native propagation; interruption; asynchronous AbortSignal cancellation; full application-layer failure Exits; synchronous suspension with immediate synchronous finalizer completion and no later program continuation; session suspension cleanup with one SessionDefect event.
5. Executed shared authored contract evaluation with an awaited model read: the asynchronous interpreter returned the result, while config's synchronous root returned `program-must-be-synchronous`. This exercises shared evaluation, rather than an end-to-end persistent SharedWorker connection.
6. Executed the real aggregate session validation and staging functions against provisioned in-memory sql.js: validation returned `program-must-be-synchronous` silently; staging returned that refusal with one StageFailure; commands and session metadata stayed empty; interrupted callbacks did not resume; subsequent staging succeeded; an authored defect propagated with SessionDefect reporting.
7. Reviewed in source: materializer cancellation before savepoint rollback and terminal command-refusal retention; prepared async emissions within that capture; ordinary/composite Cause classification; admission batch atomicity, duplicate recovery, hold release and async error envelopes; projection basis retry/permit/scratch cleanup; codec isolation; producer timeout/retry evidence and atomic response/outbox recording; standalone serialized asynchronous SQLite/commit ownership; native use of the shared execution root. Cloudflare delivery, persistent SharedWorker execution and external producer recording were not exercised end to end.
8. ManagedRuntime's shared lazy application-layer acquisition retains its existing independent runtime lifetime. A cold asynchronous layer can finish acquisition after a synchronous caller refuses; the rejected caller's program cannot resume. Server constructor application layers must acquire synchronously. This change does not dispose the shared runtime or add acquisition/warming protocols.

## Remaining work

None.
