# Contract program output

Status: Superseded on 2026-10-12 by [140 — Effect contract evaluation and concrete async receivers](140-plan-effect-contract-evaluation-and-async-receivers.md). Archived because the user selected the replacement design, not because the Channel implementation's outstanding runtime checks passed.

The sections below retain the retired design and its historical implementation evidence. Required runtime obligations continue in Plan 140 under the replacement Effect-based interface.

## The simple rule

1. Guards check and return void. External requests perform external work and return a response. Programs describe operations and return a contract result. Only the program's returned output enters command execution.
2. One `evaluateContract` function evaluates guard → original program → optional mapper → validated operations/result. It applies nothing. Sessions and materializers keep their existing transaction and application ownership.
3. Remove ambient `OperationSink`, attempted-emission flags, cannot-emit errors, and sink-based output inference. Do not replace them with an injected emitter, a public collector, or a new program framework.

## Authoring choice

1. **Agreed Channel design:** operation helpers return Channels; operation descriptions are output elements and the contract result is the completion value. Guards and requests remain Effects. A one-operation mapping is direct:

   ```ts
   program: ({ command, claims }) =>
     sdk
       .makeAsyncOperation({
         contract: asyncCreatePurchaseV1,
         payload: { aggregateId: claims.clerkUserId, quote: command.result },
       })
       .pipe(Channel.mapDone(() => command.result));
   ```

2. **Simplicity recommendation, not yet selected:** keep programs as Effects returning `{ operations, result }`; operation helpers return validated descriptions instead of emitting them. Reads, loops, early returns, and scoped resources then use the same Effect model as today:

   ```ts
   const operations =
     yield *
     Effect.forEach(cart.items, item =>
       sdk.makeDeleteOperation({ model: cartItemV1, resourceId: item.id }),
     );
   return { operations, result: quote };
   ```

3. Channel saves wrapping a single operation in a returned object. Returned data avoids a second composition model and fits execution's complete finite batch. Channel adds no streaming application or backpressure benefit here: execution must finish validation before any operation is applied. Do not implement the alternative until the user selects it.
4. If Channel is retained, use native `suspend`, `unwrap`, `fromEffectDone`, `mapDone`, and sequential composition. There is no native `Channel.gen` in installed Effect 4.0.2. `flatMap` maps output elements; `concatWith` sequences completion and closes the left scope first. Resources needed throughout the program must surround the complete Channel.
5. The selected representation must cover real `createPurchaseV1` reads/checks/early returns/loops and `mappedCheckoutV1` base-result/async output. A trivial one-operation example is insufficient to establish intuitive authoring.

## Evaluation and types

1. Move `contracts/make/makeOperations.ts` to `contracts/evaluateContract.ts`; rename its function and error type, preserve its arguments and returned `{ contractVersion, operations, result, encodedResult }`. Keep collection/normalization inside that function and use existing `runAuthoredCallback`.
2. For Channel, collect privately with `Channel.runForEach`, retaining completion. The callback must return void: `Effect.sync(() => { operations.push(operation); })`. Suspend authored construction with `Channel.suspend`. Whole-run failure discards output; recovered/retried segments retain output already consumed, matching current semantics.
3. Use the actual returned computation in `IContract` rather than separate program result/error/service parameters plus another output parameter. Delete `__operations`; infer original and mapped operation output from their programs. Public `InferContractResult` remains codec-based.
4. Shared callback inputs belong in existing `contracts/types.ts`; factory-specific constraints/defaults stay with the factories, and mapper-specific inputs stay with the mapper constructor. Remove the misleading `InferContractProgram` callback name and duplicate props, while preserving stored bivariance and authoring `NoInfer` rules. Consolidate equivalent result-schema inference without losing `never → void`. No new `contractProgram.ts` or pass-through alias.
5. Retain historical execution requirements, including ancestor/current guard services, for `previous`, upgrades, and `getVersion`. Keep payload/failure history; do not union historical operation output into current output.
6. External construction must distinguish Effect guards/requests from the selected program representation; its current shared callback schema cannot survive unchanged. Declaration checks use operation output directly and retain exact model/async contract diagnostics.

## Behavior that stays

1. Helpers validate and snapshot exact declaration-based operation descriptions lazily. Original programs produce model operations; mappers may also produce exact declared async contract operations. Each phase and the combined owner model scope remain independently checked.
2. The original result is validated before the mapper receives isolated original output. A mapper failure exposes no successful original output. Result/failure/response codecs retain their current empty-context execution and error ownership.
3. Preserve typed business failures, defects, interruption, and composite Causes through existing normalization. A guard independently constructing/consuming operation descriptions cannot add command output; this is an output rule, not a JavaScript sandbox.
4. Keep synchronous session/server evaluation and asynchronous standalone SQLite reads. External requests remain outside model-application transactions and may suspend. Persisted command/operation/result/response shapes stay the same.
5. Version-repo replay reevaluates local authored versions using recorded responses and recollects output without new producer lifecycle. Projection replay applies retained output. Neither reruns the producer.
6. Aggregate command policies run through `aggregateRelease.guards` during canonical execution. Aggregate actor guard declarations and server projection staging were removed by Plan 101; browser staging/replay and service actor guards retain their existing owners. This program-output change must not restore a server speculative execution path.
7. Returned data, if selected, requires revising recovery semantics explicitly: failed attempts expose no returned batch, and recovered/retried computations contribute only their successful returned output. Do not claim that preserves Channel's consumed-prefix behavior automatically.

## File layout and bounded edits

1. Move only evaluation. Keep declaration and operation factories in `make/`, runtime guard/producer runners beside evaluation, and shared contract types in the existing type module. No new architectural module is needed.
2. Legend: `~` modify, `-` delete, `>` move/rename. Refresh this inventory before implementation to preserve unrelated concurrent work.

   ```text
   zerospin/
   ├── packages/core/src/contracts/
   │   ├── ~ types.ts, assertOperationsUseModels.ts, README.md
   │   ├── ~ runContractGuard.ts, runExternalProducer.ts
   │   ├── > evaluateContract.ts                    (from make/makeOperations.ts)
   │   ├── - operationSink.ts, contractExecution.spike.ts
   │   └── make/
   │       ├── ~ make{Create,Update,Delete,Move,Async}Operation.ts
   │       ├── ~ construct{ContractVersion,MappedContractVersion,ExternalContract}.ts
   │       ├── ~ make{Aggregate,Service}ContractVersion.ts
   │       ├── ~ upgrade{Aggregate,Service}ContractVersion.ts
   │       ├── ~ make{Aggregate,Service}ExternalContract.ts
   │       └── ~ map{Aggregate,Service}ContractVersion.ts
   ├── packages/core/src/
   │   ├── serviceSession/
   │   │   └── ~ evaluateServiceSessionCommandTx.ts, replayPendingServiceCommandsTx.ts
   │   └── aggregateSession/
   │       ├── ~ stageCommand/stageSessionCommandTx/stageSessionCommandTx.ts
   │       └── ~ validateAggregateSessionCommand.ts, replayPendingCommandsTx.ts
   ├── packages/browser/src/StandaloneNode/
   │   └── ~ executeStandaloneCommand.ts
   ├── packages/system-worker/src/
   │   ├── ~ {Aggregate,Service}VersionRepo/materializeCommandTx.ts
   ├── examples/shopping/src/zerospin/
   │   ├── aggregates/user/contracts/
   │   │   └── ~ createPurchaseV1.ts, createTrackingLabelV1.ts,
   │   │         updateTrackingInfoV1.ts, fulfillmentContracts.ts
   │   └── services/
   │       ├── marketplace/contracts/
   │       │   ├── ~ createProduct/CreateProductV1.ts, deleteProduct/DeleteProductV1.ts
   │       │   └── ~ addToCart/{AddToCartV1,mappedAddToCartV1}.ts,
   │       │         checkout/{checkoutV1,mappedCheckoutV1}.ts
   │       └── promotion/
   │           └── ~ {Reserve,Release,Commit,Redeem}PromotionV1.ts
   ├── examples/tic-tac-toe/src/contracts/
   │   └── ~ mappedPlayXV1.ts
   └── wiki/
       ├── ~ glossary.md, patterns/index.md
       ├── ~ patterns/contracts/{contract-program-emission-and-result,
       │      omit-program-not-dummy-yields,upgrade-payload-edges-effect-fn}.ts
       ├── ~ patterns/typescript/explicit-domain-methods-no-overloads.ts
       ├── ~ architecture/AuthoredSystem.md,
       │      architecture/server/{executeAggregateCommand,serviceExecution}.md
       └── ~ plans/099-plan-channel-contract-programs.md
   ```

3. Channel inventory currently contains 31 authored callbacks in 23 files; 15 files need composition rewrites. Direct helper-return callbacks adapt without source edits. Verify those in Shopping cart contracts, tic-tac-toe originals/continuation, Studio `fixtures/agents.ts`, and `explorer/src/zerospin/sendMessageV1.ts`. Explicitly include no-output `mappedAddToCartV1` and the `asyncCreatePurchaseV1` continuation inside `mappedCheckoutV1.ts`.
4. SDK exports, repo classes, producer lifecycle, codecs, application, and persistence need inspection/verification, not predetermined rewrites. If returned data is selected, refresh caller edits: direct helper-return programs must return a program output object too. Preserve helper names and regenerate SDK declarations.

## Work and verification

1. The implementation request retains the agreed Channel representation. Prove the real examples and inference through scoped checks. Keep this plan current rather than introduce parallel plans.
2. Change helpers, types/defaults, and evaluation together; migrate required compositions and evaluation imports. Delete the sink and obsolete rejection logic outright. No Effect/Channel compatibility path.
3. In-memory probes have established synchronous Channel output/completion/finalization, recovered/retried prefix output, and left-scope closure. They do not establish application rollback or replay correctness.
4. Current core/worker/example/explorer trees contain no behavioral suites or embedded contract type assertions. Use available scoped Nx library/typecheck/lint tasks and permitted existing fixtures; do not promise nonexistent Node/Workerd coverage. Runtime transaction/replay/error-path evidence remains necessary, and new tests/runners require explicit authorization under root `AGENTS.md`.
5. Verify synchronous transaction behavior, mapper failure discard, independent runs, scope lifetime, failures/interruption, historical version replay, and standalone reads at their actual execution interfaces. Record uncovered scenarios plainly; source inspection or successful compilation is not runtime verification.
6. After implementation, reconcile current patterns/glossary/architecture, remove the spike, and create an ADR only for an implemented decision meeting the repository criteria. Archive the plan only after implementation and required verification finish.

## Source pointers

1. [Current evaluation](../../../packages/core/src/contracts/evaluateContract.ts), [contract types](../../../packages/core/src/contracts/types.ts), and [external constructor](../../../packages/core/src/contracts/make/constructExternalContract.ts).
2. [Purchase program](../../examples/shopping/src/zerospin/aggregates/user/contracts/createPurchaseV1.ts) and [mapped checkout/continuation](../../examples/shopping/src/zerospin/services/marketplace/contracts/checkout/mappedCheckoutV1.ts).
3. [Current authoring pattern](../../patterns/contracts/contract-program-emission-and-result.ts), [glossary](../../glossary.md), and [version lookup](../../../packages/core/src/contracts/getVersion.ts).

## Implementation outcome

1. Implemented the agreed Channel cutover: helpers lazily describe exact operations, original programs return model-operation Channels, mapper Channels may additionally produce declared async operations, and completion carries the result. Guards and external requests remain Effects.
2. Moved evaluation to `contracts/evaluateContract.ts`, preserving the returned evaluation data and existing transaction/application owners. Removed `operationSink.ts`, obsolete emission rejections, sink inference, and the spike. Collected output is private to each run; mapper failures expose no successful output.
3. Migrated all 15 composition files. All 31 authored callbacks in 23 files pass strict direct typechecking against regenerated declarations, including direct-helper callbacks in Shopping, tic-tac-toe, explorer, and Studio source fixtures. Consolidated callback inputs/result inference and retained historical payload/failure/guard/program requirements without historical operation-output unions. Factory validation lives in callback return intersections so contextual inputs and the actual returned Channel infer correctly.
4. Reconciled current authoring patterns, glossary, contract README, and directly affected architecture references. No ADR was added: the implemented representation is a real trade-off, but the decision does not meet the repository's hard-to-reverse criterion.
5. The final scoped Nx graph passed library, TypeScript, and lint tasks for core, SDK, browser, system worker, Studio, Shopping, tic-tac-toe, and explorer: 30 tasks including dependencies. Existing lint warnings remain in unrelated code. Concurrent Plans 100/101 build blockers were resolved by their own work; this implementation preserves those edits. Logs: `/tmp/zerospin-plan-099-core-lib.log`, `/tmp/zerospin-plan-099-scoped-checks.log`, `/tmp/zerospin-plan-099-authored-types.log`.
6. Independent source review found no regression in lazy snapshots, ordered output, mapper isolation, whole-run failure discard, or scope closure. This is source evidence, not runtime verification. Native `Channel.retry` resets its retry schedule after output; no migrated program currently uses retry, and consumed-prefix retention does not imply identical retry-count behavior to `Effect.retry`.
7. Scoped formatting and whitespace checks pass for 61 files. Documentation verification passes for 51 exact source hashes/ranges and 22 source links. Two edited pattern example type errors and contradictory async-payload wording were corrected. Final native CLI typechecking of wiki pattern examples is unavailable because their imports lack workspace dependency links; no passing pattern typecheck is claimed.

## Remaining work

1. None in this superseded plan. [Plan 140](140-plan-effect-contract-evaluation-and-async-receivers.md) owns the replacement implementation and required runtime checks for rollback, failed-composition discard, independent evaluation, resource lifetime, Cause preservation, historical/recorded-response replay, asynchronous standalone reads, and concrete async delivery. The previous Channel runtime cases remain unverified historical work; supersession does not turn compilation/source review into runtime evidence.
