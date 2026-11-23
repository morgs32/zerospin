# Effect contract evaluation and concrete async receivers

Status: Completed and verified on 2026-10-12. Archived after the approved hard cutover, scoped framework/consumer gates, type-inference checks and runtime acceptance checks passed. Its same-owner delivery scope was superseded by [Plan 142](142-plan-addressed-async-continuations.md); its Effect evaluation and concrete declaration design remain in use.

Confirmed requirements and proposed implementation mechanisms are distinguished below. The selected same-owner scope supplies a binding-free receiving-identity rule: the owning workflow provides the exact release, and aggregate output explicitly names and must match its instance. Preserve existing delivery and authority. Cross-owner, cross-release, cross-instance and aggregate/service crossing are outside this plan.

## Confirmed requirements

1. Combine the contract-design conversation and [the async receiver conversation](codex://threads/01a130b4-0ee6-7a52-8e2e-5cdb3a3e8b7f) into this single implementation plan. The linked conversation was read from its local session transcript; its proposals were checked against current source. Replace the Channel design of [099](099-plan-channel-contract-programs.md). Its unfinished runtime obligations continue here; supersession does not claim that the previous implementation was fully verified.
2. Authored `program` callbacks return ordinary Effects containing `{ operations, result }`. Operation helpers return Effects containing validated operation descriptions. Remove contract Channel/Stream authoring, collection and composition. Retain streams used for independent subscriptions and session lifetime.
3. Constructors retain authored callbacks privately and expose checked `contract.evaluate(input)`. The checked method owns its implementation's guard, read scoping, declared failures, and complete operation/result validation. It applies nothing.
   Remove contract `ownerKind`, including the redundant contract-spec field. Preserve concrete aggregate/service scopes through declarations, registries, upgrades and invocation inputs. This requirement and the rejection of owner bindings were verified in the originating conversation recorded by [the archived handoff](../handoffs/2026-10-12-handoff-concrete-contracts-and-async-operations.md).
4. `models` is the read scope for `db`. `operations` is the codec for validating, encoding and decoding the complete returned operation array. Mutation permission comes from that codec, independently of readable models.
5. A server implementation explicitly references a public contract version and supplies its own Effect program, read scope, operation codec, result codec and optional guard. It can call `publicContract.evaluate(input)` when useful. Each implementation owns its guard; a server implementation does not automatically inherit the public guard. Owner/actor security policies retain their existing mandatory execution responsibilities.
6. Replace the generic optional-ID async operation and tagged receiving-owner/binding abstraction with concrete aggregate and service operations, codecs and constructors. Aggregate receivers require a nonempty framework aggregate ID; service receivers have no framework aggregate fields. A payload property named `aggregateId` does not establish framework instance scope. Do not recreate the rejected contract/owner pairing through codec constructors, renamed bindings or binding-shaped catalogs.
7. Keep producer retries, timeouts, response recording, recovery and original-only production shared. Carry the concrete receiver through persistence, delivery and admission. Keep the producing Repo's evidence and source provenance separate from receiving authority.
8. Perform a hard cutover of source, callers, exports and affected documents. Changed fixed storage requires empty storage. No compatibility aliases, old Channel path, mapper fallback, old receiving-owner decoder, or row translation. Preserve unrelated WIP. Inspect overlapping rejected binding WIP and replace its representation within the agreed cutover; its cross-owner checks are implementation attempts, not evidence that the capability was approved.
9. Investigate the abstraction behind encountered `kind` discriminators within this work. Preserve actual protocol/security distinctions; this request does not expand into an unrelated repository-wide discriminator removal.

## Reconciled design decisions

1. **Receiving capability — selected by the user.** Preserve current aggregate-to-same-aggregate-instance/release and service-to-same-service-release delivery. No new cross-owner/release/instance route or authority is introduced. Never substitute the emitting aggregate ID for an explicit receiving ID: validate equality before any output application or emission persistence, then retain that explicit ID.
2. **Binding-free receiving identity — derived from that scope.** Aggregate/service owning workflows already hold the exact executing release and immutable Repo key. That context supplies receiving release name/version; operation schemas capture only the exact canonical external declaration and their concrete input shape. Constructors/registration reject an external declaration absent from that same release or of the wrong family. No owner/contract tuple, receiving-release import, catalog entry or deferred owner linker is authored. The earlier `makeAsyncAggregateOperationSchema({ aggregateName, aggregateVersion, contract })` proposal recreated the rejected pairing and is withdrawn.
3. **Concrete runtime provenance — implementation proposal.** The user requires removal of `ownerKind` and correct concrete inputs/registration. This plan recommends separate canonical aggregate/service classes, family-specific internal symbols and completed WeakSets, following the existing canonical-construction policy. The mechanism is proposed implementation, not attributed to the user as a separately approved class design. It rejects wrong-family or incomplete declarations even for zero-argument callbacks, at construction/registration rather than through repeated classification in shared execution.
4. **Authority — preserve the governing model.** Existing same-owner actor/agent/claims checks, frozen source provenance, recorded-command proof and original-only production remain. Remove the prior cross-context system-authority proposal from this work. ADR 008 continues governing receiver authority without a new conversion rule.

## Authoring interface

1. Expose cached complete unfinalized operation codecs on each canonical model. They derive from the existing model-owned body/resource-ID codecs; authors do not duplicate attribute schemas.

   ```ts
   export const createGame = sdk.makeAggregateContractVersion(
     sdk.defineAggregateContract('createGame'),
     {
       version: '1.0.0',
       claims: claimsSchema,
       models: { game },
       operations: Schema.Array(game.operations.create),
       payload: { id: sdk.primitives.foreignKey({ abbreviation: 'gam' }) },
       // Existing declared failures and guard remain authored here.
       program: Effect.fn('createGame.program')(function* ({ payload }) {
         const operation = yield* sdk.makeCreateOperation({
           model: game,
           resourceId: payload.id,
           attributes: { board: '.........', turn: 'X', outcome: 'playing' },
         });
         return { operations: [operation], result: undefined };
       }),
     },
   );
   ```

2. Generate concrete async operation codecs from the corresponding canonical external declaration alone. The same-owner workflow supplies release identity; aggregate operations explicitly supply the matching instance ID.

   ```ts
   const paymentOperation = sdk.makeAsyncAggregateOperationSchema(
     asyncProcessPaymentV1,
   );
   const notificationOperation = sdk.makeAsyncServiceOperationSchema(
     asyncNotifyPurchaseV1,
   );

   yield *
     sdk.makeAsyncAggregateOperation({
       contract: asyncProcessPaymentV1,
       aggregateId,
       payload: paymentPayload,
     });
   yield *
     sdk.makeAsyncServiceOperation({
       contract: asyncNotifyPurchaseV1,
       payload: notificationPayload,
     });
   ```

3. Async schemas capture the exact external declaration, payload schema and concrete aggregate/service input shape. Makers reuse those generated codecs and fill only their dynamic inputs. There is no separately authored `contracts` catalog or `{ owner: { kind: ... }, contract }` binding. The notification example illustrates service scope; adding that application feature is outside this plan.
4. Construct a canonical server implementation with `makeAggregateServerContract` or `makeServiceServerContract`. Keep the public declaration's payload, claims, failures, command identity and version lineage authoritative. The server implementation owns its independently declared execution schemas and callbacks. Its public-declaration reference expresses code implementation, not a separately authored contract/receiving-owner binding.

   ```ts
   const createPurchaseServerV1 = sdk.makeAggregateServerContract({
     contractVersion: createPurchaseV1,
     models: createPurchaseV1.models,
     operations: Schema.Array(
       Schema.Union([
         ...createPurchaseV1.operations.value.members,
         paymentOperation,
       ]),
     ),
     result: CreatePurchaseResult,
     program: Effect.fn('createPurchaseServerV1.program')(function* (input) {
       const purchase = yield* createPurchaseV1.evaluate(input);
       if (purchase.result.code !== 'purchase-created') return purchase;
       const payment = yield* sdk.makeAsyncAggregateOperation({
         contract: asyncProcessPaymentV1,
         aggregateId: input.aggregateId,
         payload: {
           purchaseId: purchase.result.data.purchaseId,
           total: input.payload.quote.total,
           key: `shopping:${input.aggregateId}:${purchase.result.data.purchaseId}:payment`,
         },
       });
       return {
         operations: [...purchase.operations, payment],
         result: purchase.result,
       };
     }),
   });
   ```

5. `Schema.Array(canonicalLeaf)` and `Schema.Array(Schema.Union(canonicalLeaves))` are the proposed operation declaration forms. The purchase example uses its multi-operation schema. Installed Effect exposes `Array.value` and `Union.members`, so constructors inspect those direct members without an AST walker. Generated mutation leaves have exact model/operation metadata; async leaves capture their exact external declaration and concrete family. Cache schemas per canonical declaration. Reject unrecognized leaves rather than accepting a permissive arbitrary schema as mutation authority.
6. Omitted `operations` defaults to an array-of-never codec accepting only an empty array. Omitted `program` supplies `{ operations: [], result: undefined }`. Omitted result codec retains the existing void/null persistence policy. Declaring mutation schemas does not grant reads; declaring read models does not grant mutations. Every authored version/upgrade explicitly owns its operation and result schemas.

## Checked evaluation and type ownership

1. Proposed enforcement mechanism: canonical `AggregateContract` and `ServiceContract` instances with separate completed-instance provenance. The authoring definitions would be concrete aggregate/service definitions containing the command name, with nominal provenance rather than an `ownerKind` field. Domain constructors and registry boundaries would validate provenance once. Required behavior: callbacks taking no arguments and structural bivariance cannot make a service declaration valid on an aggregate, and shared execution must not repeatedly rediscover family through flags, `instanceof` switches or optional-ID inputs.
   `IAggregateContracts` and `IServiceContracts` constrain their respective release, actor and session registries. Server/external declarations preserve the corresponding concrete family. Payload upgrades and `getVersion` preserve concrete family and history. Shared structural types describe genuinely common schema/evaluation facts; they are not an owner-erasing public registry.
   Use family-specific internal canonical identity symbols as well as completed WeakSets. The existing shared `Contract` symbol must not misclassify a same-core declaration of the wrong family as a duplicate-core instance. These are construction/provenance checks, not a new public ownership flag.
2. `evaluate` accepts current decoded payload/claims, a restricted read source, and concrete invocation inputs. Aggregate input requires `aggregateId`; service input excludes it. External continuation input requires its decoded recorded response. Split ordinary/external preparation into aggregate/service entry points that own those concrete checks and reuse payload/claims/response codec procedures. Serialized command version selection and payload up/down adaptation stay in the existing owning workflows; nested evaluation does not repeat transport decoding or payload adaptation.
3. The shared implementation in `contracts/evaluateContract.ts` receives correctly established inputs and becomes a linear Effect workflow: scope reads → run this implementation's guard → invoke its private program → validate the complete returned operation array → validate result → return `{ operations, result }`. Concrete `.evaluate` constructors supply their input checks without a generic family classifier. Reuse the existing authored callback/failure policy. No original collection, mapper snapshot, replacement phase, public collector, emitter, generator adapter or per-call alternate runtime remains.
4. Keep `program` and its guard as constructor inputs, with their authored callbacks private after construction. Concrete contract interfaces expose `evaluate`, schemas and public identity/history. Derive operation types from `operations['Type'][number]`, result types from the result codec, and execution requirements from the actual evaluator Effect. Keep current/historical guard/program requirements in authored version lineage; historical operation types do not enlarge current operation permission.
5. Factory callback constraints use the inferred Effect success and `NoInfer` to check returned operation/result types without destroying contextual input/service inference. Keep precise declared business failures. Operation/helper payload generics cannot widen their captured model or external declaration from an argument.
6. Validate and snapshot mutable operation bodies/payloads through the existing known-shape policy; preserve canonical Model/external references and return an owned readonly operation array. Preserve the result codec's validated decoded value, including supported class/prototype identity, rather than promising a generic clone or encode/decode copy. A composing server may explicitly construct different output; child output and final server output each satisfy their own codecs, while canonical declaration metadata remains immutable.
7. Evaluation returns decoded domain output only. Owning workflows encode the selected implementation's result once, before applying any operations, inside the existing savepoint/transaction; encoding refusal yields no applied batch. `encodedResult` and command `contractVersion` cease to be composition return fields. Command version remains retained provenance. Keep result/failure/response/operation codecs portable and isolated from arbitrary caller services.
8. Evaluation creates no independent resource scope or transaction. Nested `.evaluate` calls share the owning workflow's scope, so resources survive subsequent server steps. Existing synchronous savepoints/fences own suspension refusal, interruption/finalizer settlement, rollback and error classification. Standalone asynchronous SQLite reads continue through their existing asynchronous execution path.
9. Recovered/retried Effects contribute only their successful returned batch. Failed attempts expose no batch. This intentionally replaces Channel consumed-prefix semantics; no hidden accumulation recreates it. A later server failure exposes no successful client operations to application.

## Operation codecs and registration

1. `model.operations.{create,update,delete,move}` are codecs for complete unfinalized operations, capturing exact canonical model identity. Their decoded side contains the model reference, version, operation name, resource ID and decoded body. Their encoded side contains portable model name/version, operation name, resource ID and the existing portable body representation. Encoding refuses foreign model references; decoding checks the fixed identity and restores the captured canonical model.
2. Reuse `operationCodecs(model)` for complete/patch attributes, deletion, constrained moves and portable body encoding. Consolidate the existing forward encoding/replay decoding dispatch around those leaves. Application metadata—command ID, operation index, application time, previous timestamp and inverse—remains owned by the application/journal codecs. Received applied history still decodes against the exact receiving owner's model graph; a currently narrower command operation permission must not rewrite finalized historical output.
3. `IAsyncAggregateOperation` requires `aggregateId`, exact external `contract` and decoded payload. `IAsyncServiceOperation` carries exact external `contract`/payload and no aggregate scope. Both retain the meaningful existing `operationName: 'async'`. The exact same-owner release comes from the executing workflow; no receiver name/version is independently authored on the operation or its schema. Remove `IAsyncOwner`, `IAsyncContractBinding`, `AsyncReceivingOwnerSchema`, the generic optional-ID maker and conditional inputs. Use concrete command schemas at receiving endpoints as well.
4. Authored async codecs encode portable external contract name/version/payload and the required aggregate ID where applicable, restoring their captured canonical external reference on local decode. The owning retention workflow supplies its exact release identity and validates same-instance equality before persisting it. Recorded continuation reconstruction uses portable wire decoding and needs no current declaration. Service operations cannot acquire aggregate fields; aggregate operations cannot omit their instance ID.
5. Owner/actor construction validates every read model and mutation-model leaf against its exact local database graph. Mutation-only models are valid without read access. Ordinary public declarations and external continuation declarations permit model operations only; preserve their existing async refusal and browser-safe graphs. Aggregate server implementations may additionally declare aggregate async leaves; service server implementations may additionally declare service async leaves. Server constructors accept ordinary public declarations, not external continuations or another server implementation. Validate each exact external declaration's membership in the executing release and applicable actor/agent scope, using concrete family registries. Preserve current same-owner claims rules and reject unsupported receiving families before execution.
   Nested evaluation cannot recover read authority omitted by its parent. A server that invokes a public evaluator declares that child's read models within its own scope; `.evaluate` input types preserve the required read-model keys and the runtime source remains restricted.
6. Owner and actor registries accept ordinary declarations, canonical server implementations and external declarations. A server entry stores `contractVersion` and its execution fields, without copied command/payload/history properties. Resolve public declaration and selected implementation once in existing aggregate/service execution-selection procedures. Public/session/agent projection selects `contractVersion`; it never imports server code into a browser graph.
7. Add operation schema facts to public contract specs/session locks and server implementation specs. Replace the existing nested `original` mapper projection with explicit public declaration plus server execution facts. Read-model facts and mutation declarations stay distinct. Accepted definitions retain portable schemas, external declaration identities and owning registry context, never executable callbacks or canonical object references. Update matching System/session schemas, lock checks, manifests and display consumers together.

## Async persistence, delivery and authority

1. Preserve aggregate-to-same-aggregate-instance/release and service-to-same-service-release delivery, frozen source provenance, existing actor/claims validation, and ADR 001/008 production/replay guarantees. The explicit aggregate ID must match the owning evaluation/Repo instance before output application or emission persistence; refuse a different ID instead of replacing it. No different owner/release/family route is supported by this plan.
2. Keep one producer lifecycle implementation and its existing physical async work/outbox ownership. The emitting VersionRepo owns child identity, retries/timeouts, response recording and delivery evidence. External requests remain outside synchronous model-application transactions. Retain its exact owner release context, explicit aggregate ID, operation indexes and frozen inputs without an authored receiving-owner binding.
3. Recording a validated portable response and enqueuing delivery remain one synchronous transaction. Once observed, reconstruct the complete child from retained operation/input, response and source evidence; do not rerun the program/request, require the initiating command row, or look up the current external declaration. Recorded reconstruction uses portable concrete wire schemas. Declaration lookup belongs to pending producer execution and fresh receiving admission; an exactly equal retained child recovers before current-declaration checks. Replay retains immutable output and null production authority, never starts a producer.
4. Reconstruct aggregate and service children through concrete procedures/schemas and preserve typed receiving endpoints. Keep existing acknowledgement, retries, stable child identity and idempotent recorded admission. Preserve owner-local producer proof and subscriber routing. Use the retained explicit aggregate ID after validating it against the owner-local key. No new producer-address envelope, alternate-chain routing or page-size change is required.
5. Update immutable output readers and projection validation for the concrete operation shape while preserving indexes. Actor/session projections skip async output and preserve model indexes. If the selected shape changes fixed async rows, transported output or definition/lock schemas, require empty affected storage without row adoption or translation.

## Implementation sequence

1. Refresh the dirty-file inventory and preserve unrelated changes, including `.vscode/settings.json`, `AGENTS.md` and unrelated authorization edits. Do not finish wiring the rejected binding WIP simply to make it compile. Establish the proposed concrete declaration provenance and domain registry types, then model-owned operation codecs and concrete async makers. Keep canonical schema capture lazy where needed; do not add casts requiring `ALLOWED_CAST`.
2. Convert ordinary/external construction, upgrades and shared type inference to Effect output and checked `.evaluate`. Add concrete aggregate/service server constructors and preparation entry points. Remove `ownerKind`/`IContractOwnerKind`, exposed raw program callbacks, mapping metadata, both map factories and the three mapper/original collection files. Retain focused common payload/claims/response/failure/result and callback normalization responsibilities.
3. Update owner/actor/agent validation, registry resolution and System/spec/session-lock projection. Derive async declaration validation from selected codec provenance rather than a duplicated catalog. Preserve mandatory owner policies and the settled per-implementation guard rule.
4. Convert the seven direct evaluator consumers: aggregate/service staging and pending replay, StandaloneNode, and aggregate/service VersionRepo evaluation. Update their result encoding and application paths together. No partial batch is applied during composition; retain current savepoints, resource scopes and rollback classifications.
5. Implement concrete same-owner async output, with owner-supplied release identity and explicit same-instance validation before writes. Preserve local delivery, proof and authority. Replace generic receiving-owner/command shapes and update journals/projections together. Remove the rejected cross-owner binding WIP without completing its unselected capability.
6. Convert all authored contracts and supporting Studio fixtures to explicit Effect-returned arrays. Migrate Shopping's five mapped server declarations and Tic-tac-toe's server `playX` implementation; preserve their checks/results while naming implementations directly rather than `mapped*`. Keep declarations one version per file. Update server-only and browser exports together, with no aliases.
7. Run scoped source/consumer gates and the bounded runtime checks below. Fix only failures caused by this plan. Reconcile docs afterward; archive this plan only after required verification passes and no work remains.

## Planned file hierarchy

Legend: `+` create, `~` modify, `-` remove, `>` rename/move. Braces group existing related files; directory entries cover in-scope members only. Class/factory names describe the proposed implementation. All async changes preserve same-owner delivery. Refresh exact authored-file names at implementation start.

```text
zerospin/
  packages/core/src/
    models/
      ~ types.ts
      ~ make/makeModelVersion.ts
    contracts/
      ~ types.ts, operationCodecs.ts, assertOperationsUseModels.ts, ownerGuards.ts
      ~ definition.ts, defineAggregateContract.ts, defineServiceContract.ts, getVersion.ts
      + AggregateContract.ts, ServiceContract.ts            # proposed provenance mechanism
      ~ evaluateContract.ts, runContractGuard.ts, externalContract.ts
      ~ encodeAppliedOperation.ts, prepareReplayAppliedOperation.ts
      ~ resultCodec.ts, failureCodec.ts, README.md
      - prepare/{prepareOrdinaryInvocation,prepareExternalInvocation}.ts
      + prepare/{prepareAggregateInvocation,prepareServiceInvocation}.ts
      + prepare/{prepareAggregateExternalInvocation,prepareServiceExternalInvocation}.ts
      + asyncAggregateOperation.ts, asyncServiceOperation.ts
      + AsyncAggregateCommandSchema.ts, AsyncServiceCommandSchema.ts
      - asyncOperation.ts, AsyncReceivingOwnerSchema.ts, AsyncCommandSchema.ts
      - evaluate/{collectOriginalOutput,evaluateContractMapping,snapshotMappingInput}.ts
      make/
        + makeAggregateServerContract.ts, makeServiceServerContract.ts
        + makeAsyncAggregateOperationSchema.ts, makeAsyncServiceOperationSchema.ts  # canonical external declaration only
        + makeAsyncAggregateOperation.ts, makeAsyncServiceOperation.ts
        ~ constructContractVersion.ts
        ~ make{Aggregate,Service}ContractVersion.ts
        ~ make{Aggregate,Service}ExternalContract.ts
        ~ upgrade{Aggregate,Service}ContractVersion.ts
        ~ make{Create,Update,Delete,Move}Operation.ts
        - ContractMapping.ts, makeAsyncOperation.ts
        - map{Aggregate,Service}ContractVersion.ts
    ~ declaration/validateActorContracts.ts
    ~ assertSameCoreInstance.ts                           # concrete family diagnostics
    ~ {aggregate,service,aggregateActor,serviceActor}/types.ts
    ~ aggregate/make/makeAggregateRelease.ts
    ~ aggregateActor/make/makeAggregateActorVersion/makeAggregateActorVersion.ts
    ~ service/make/makeServiceRelease.ts
    ~ serviceActor/make/makeServiceActorVersion.ts
    ~ agent/makeAgentContract.ts
    ~ sessionRelease/makeAggregateSessionRelease.ts
    aggregateSession/
      ~ evaluateAggregateSessionCommandTx.ts, replayPendingCommandsTx.ts
      ~ executionDeclaration.ts, types.ts, AggregateSessionLockSchema.ts, README.md
      ~ make/{makeAggregateSessionLock,makeAggregateSessionSpec}.ts
    serviceSession/
      ~ evaluateServiceSessionCommandTx.ts, replayPendingServiceCommandsTx.ts
      ~ types.ts, ServiceSessionLockSchema.ts, README.md
      ~ make/{makeServiceSessionRelease,makeServiceSessionLock}.ts
    system/
      ~ types.ts, SystemSpecSchema.ts
      ~ project/{projectContractSpec,projectOwnerSpec,projectSessionFacts}.ts
      ~ make/makeSystem/{makeSystem,validateAgentBindings}.ts
      > make/makeSystem/validateAsyncBindings.ts -> validateAsyncOperations.ts
  packages/browser/src/
    ~ StandaloneNode/executeStandaloneCommand.ts
    ~ dependent session/standalone declaration types
  packages/system-worker/src/
    asyncOperations/
      ~ asyncOperationsDbConfig.ts, makeAsyncOperations.ts
      ~ prepareAsyncOperation.ts, readPreparedAsyncCommand.ts, readOperationOutput.ts
      ~ validateRecordedExternalInput.ts, README.md
    {AggregateVersionRepo,ServiceVersionRepo}/
      ~ {AggregateVersionRepo,ServiceVersionRepo}.ts        # concrete local endpoints, preserve routing
      ~ {aggregateVersionRepoDbConfig,serviceVersionRepoDbConfig}.ts
      ~ getPreparedAsyncCommand/                            # concrete owner-local endpoints
      ~ utils/{bind*,evaluate*,prepare*Output,apply*OutputTx}.ts
      ~ authorizeSession/                                  # public contract/spec resolution
    {AggregateChain,ServiceChain}/
      ~ admitAsyncCommands/{receiveAsyncCommands,admitAsyncCommands,admitRecorded*CommandsTx}.ts  # preserve local proof
    ~ AggregateChain/admitAggregateCommands/{validateNewAggregateCommand,validateAgentCommand}.ts
    ~ ServiceAccessApi/authorize/authorizeServiceSession/validateServiceSessionLock/selectServiceLockMembers.ts
    ~ aggregateProjection/applyExecutedCommands/prepareProjectionOccurrence.ts
    ~ serviceProjection/prepareServiceProjectionOccurrence.ts
  packages/sdk/src/
    ~ index.ts, browser/index.ts
  packages/studio/src/
    ~ fixtures/agents.ts                                  # preserve fixture/story infrastructure
    ~ affected spec/contract display consumers
  examples/shopping/src/zerospin/
    ~ aggregates/user/contracts/{createPurchaseV1,createTrackingLabelV1,updateTrackingInfoV1}.ts
    ~ aggregates/user/contracts/fulfillmentContracts.ts  # split declarations per existing pattern
    ~ services/marketplace/contracts/**/*.ts             # authored programs + server implementations
    ~ services/promotion/*V1.ts
    ~ affected release/actor imports
  examples/tic-tac-toe/src/
    ~ contracts/{createGameV1,playXV1,asyncPlayOV1}.ts
    > contracts/mappedPlayXV1.ts -> contracts/playXServerV1.ts
    ~ affected release/actor imports
  explorer/src/zerospin/
    ~ authored contract programs and operation schemas
  wiki/
    + plans/140-plan-effect-contract-evaluation-and-async-receivers.md
    > plans/099-plan-channel-contract-programs.md -> archive/plans/099-plan-channel-contract-programs.md
    ~ patterns/contracts/{contract-program-emission-and-result,contract-mutations-stay-in-owner-models,omit-program-not-dummy-yields}.ts
    ~ patterns/index.md, glossary.md
    ~ architecture/AuthoredSystem.md
    ~ architecture/server/{executeAggregateCommand,serviceExecution}.md
    ~ source-linked workflows for affected evaluation/async delivery
    > handoffs/2026-10-12-handoff-concrete-contracts-and-async-operations.md -> archive/handoffs/2026-10-12-handoff-concrete-contracts-and-async-operations.md
```

## Verification and documentation

1. Run the existing Nx library/type/lint graph for the affected framework and consumers, refreshing resolved project configuration first. Current Core provides `lib`, `lint` and `tsc:typecheck`; consumer `ts` targets vary. Select Core, SDK, browser, system-worker, Studio, Shopping, Tic-tac-toe and explorer, plus only additional public consumers actually affected by emitted declaration changes. One graph schedules shared dependencies; use scoped formatting and diff checks. Planning discovery is not implementation verification.
2. Check factory/evaluator inference through existing authored files: concrete family registration (including zero-argument callbacks), empty and single/multiple operation arrays, read-only and mutation-only model scope, operation-kind refusal, public/external-continuation async refusal, exact model/receiver/payload typing, aggregate-required ID/service-excluded ID, independent server result codec, declared failures and nested/historical service requirements. No test file or compile-check runner is created by this planning task.
3. Require the smallest meaningful runtime cases at actual interfaces: checked guard order and one guard invocation per composed implementation; operation codec round trips and foreign/undeclared output refusal; later server/result-encoding failure with no application plus synchronous suspension rollback/Cause preservation; resource lifetime, independent evaluations and standalone asynchronous SQLite reads; one historical/recorded-response replay with no producer restart; the two existing same-owner delivery paths with explicit instance checks, retained provenance and one tampered/retried delivery. Prove wrong-family/foreign-release declaration refusal and rejection of a different aggregate instance before writes. Retained reconstruction/admission recovery must work after its current external declaration disappears. No cross-owner success case or authority conversion is part of acceptance.
4. Reuse existing runnable fixtures/verification seams where they establish these cases. Root `AGENTS.md` forbids creating tests, fixtures, test/check runners or configuration without an explicit request. This planning task authorizes none of those files. If a required case lacks an existing seam, obtain the specific authorization during implementation and keep that case outstanding until exercised; compilation/source review cannot close it. Shopping browser/manual UI verification remains prohibited by its `AGENTS.md`.
5. After implementation, update the contract/session/async module READMEs, current patterns, source-linked workflow diagrams and glossary. Remove mapper/Channel descriptions in affected current docs; retain historical archived evidence. Preserve ADR 008's same-owner authority model and amend governing wording only where a mechanism changed without changing its invariant. Create a new ADR only if the implemented decision meets all repository criteria; create no glossary entries or ADRs during planning.
6. Completion requires the hard cutover, affected caller/schema/export/doc conversion, passing appropriate checks, and recorded runtime evidence. Do not archive merely because typechecking passes or permission for a missing verification seam has not yet been obtained.

## Source anchors

1. [Current evaluation](../../../packages/core/src/contracts/evaluateContract.ts), [aggregate preparation](../../../packages/core/src/contracts/prepare/prepareAggregateInvocation.ts), [service preparation](../../../packages/core/src/contracts/prepare/prepareServiceInvocation.ts), [aggregate external preparation](../../../packages/core/src/contracts/prepare/prepareAggregateExternalInvocation.ts), [service external preparation](../../../packages/core/src/contracts/prepare/prepareServiceExternalInvocation.ts), and [callback policy](../../../packages/core/src/execution/runAuthoredCallback.ts).
2. [Model-derived operation codecs](../../../packages/core/src/contracts/operationCodecs.ts), [forward/applied encoding](../../../packages/core/src/contracts/encodeAppliedOperation.ts), and [replay decoding](../../../packages/core/src/contracts/prepareReplayAppliedOperation.ts).
3. [Current public projection](../../../packages/core/src/contracts/externalContract.ts), [System contract projection](../../../packages/core/src/system/project/projectContractSpec.ts), and [System async validation](../../../packages/core/src/system/make/makeSystem/validateAsyncOperations.ts).
4. [Shared producer lifecycle](../../../packages/system-worker/src/asyncOperations/makeAsyncOperations.ts), [current child reconstruction](../../../packages/system-worker/src/asyncOperations/readPreparedAsyncCommand.ts), [AggregateVersionRepo outbox](../../../packages/system-worker/src/AggregateVersionRepo/AggregateVersionRepo.ts), and [ServiceVersionRepo outbox](../../../packages/system-worker/src/ServiceVersionRepo/ServiceVersionRepo.ts).
5. [Aggregate recorded admission](../../../packages/system-worker/src/AggregateChain/admitAsyncCommands/admitAsyncCommands.ts), [service recorded admission](../../../packages/system-worker/src/ServiceChain/admitAsyncCommands/admitAsyncCommands.ts), and [outbox recipient seam](../../../packages/system-worker/src/makeOutboxQueue/makeOutboxQueue.ts).
6. Preserve [ADR 001](../../adrs/001-async-replay-retains-output-without-production.md), [ADR 005](../../adrs/005-ordered-original-execution-and-finalized-replay.md), [ADR 007](../../adrs/007-canonical-results-and-selected-chain-ownership.md) and [ADR 008](../../adrs/008-ordinary-and-recorded-continuation-authority.md). [107](107-plan-contract-evaluation-phases.md) and [108](108-plan-model-operation-codecs.md) provide current evaluator/codec evidence, not authority to retain superseded Channel/mapping structure.
7. [Archived concrete-family handoff](../handoffs/2026-10-12-handoff-concrete-contracts-and-async-operations.md) records the directly verified removal of contract `ownerKind`, rejection of owner/contract bindings, WIP findings and the earlier open decisions. This plan reconciles them with the later same-owner scope answer and retains proposed implementation mechanisms without attributing them to the user as explicit approvals.

## Reconciliation record

1. The handoff's mandatory removal of `ownerKind`, required aggregate instance scope, service scope exclusion and rejection of separately authored bindings are incorporated in the confirmed requirements. Its wrong-family registration/bivariance concern is retained with the proposed canonical class/WeakSet mechanism, clearly distinguished from user-stated requirements.
2. The user subsequently selected “Preserve same-owner delivery for now.” That makes the executing owner/release the receiving context and requires equality for the explicit aggregate instance ID. Async schema construction therefore needs only the canonical external declaration, not an owner tuple or cyclic receiving-release import. The initial tuple-plus-contract schema proposal is withdrawn.
3. The handoff's recommendation to share Channel/mapping evaluation is superseded by the later agreed Effect-returned output and explicit server composition. Shared payload/claims/response decoding, guard/output validation, callback normalization and producer lifecycle responsibilities remain. Sharing meaningful procedures does not preserve the superseded Channel or mapper mechanism.
4. Cross-owner, cross-release, cross-instance and aggregate/service crossing are excluded by that scope answer. Remove the prior four-route proposal, producer-address envelopes, dynamic recipient routing and receiver system-authority conversion from implementation, hierarchy, verification and ADR work. Existing producer proof, claims and provenance rules remain.
5. The handoff's instruction not to archive Plan 099 merely for a handoff does not conflict with its later archival for an explicitly selected replacement architecture. Plan 099 is historical supersession evidence, not a completed-runtime claim; this plan carries the relevant unfinished verification.
6. The handoff's remaining actions, restrictions, source pointers and suggested skill workflow now have one owner here. Continue planning through `$spec` without reopening confirmed requirements; use `$implement` for the approved implementation and unfinished verification, with relevant local/shared patterns and scoped Nx execution. Archive the reconciled handoff as historical context; retain this plan active until implementation and required checks complete.

## Implementation outcome

1. Completed the hard cutover to private Effect programs and checked concrete aggregate/service evaluation. Server implementations explicitly retain their public declaration, own independent guards/codecs, and compose successful returned batches. Removed contract Channels, mapping factories/metadata, raw callbacks and contract ownerKind.
2. Model-owned complete operation codecs now determine mutation permission independently of readable models. Public/server/owner/actor/agent/session registration validates exact canonical identities and both public and selected execution scope. Portable specs and locks retain full mutation model facts and exact async payload schema facts.
3. Concrete async aggregate/service operations capture only the canonical external declaration. Aggregate output retains its explicit ID and rejects a different owning instance before writes. Shared producer lifecycle, original-only authority, frozen provenance, atomic response/outbox recording, owner-local proof and declaration-free retained child recovery remain intact.
4. Converted authored examples, Studio fixtures, exports, CLI seeding, public documentation and source-linked architecture workflows. The executed-command journal's ownerKind and shared lifecycle's emissionOwnerKind remain meaningful protocol/provenance distinctions; they are not contract ownership fields or receiving-owner bindings. Existing authority ADRs still govern; ADR 008's mechanism wording now refers to programs.
5. Changed fixed async work, accepted-definition and session-lock schemas require empty affected storage. No compatibility decoder, migration, row adoption, binding catalog or alternate receiver route was added. Preserved unrelated initial WIP.

## Verification evidence

1. The local Nx graph passed on 2026-10-12: `pnpm nx run-many -t lib ts typecheck lint --projects=@zerospin/core,@zerospin/sdk,@zerospin/browser,system-worker,@zerospin/studio,shopping,tic-tac-toe,explorer,@zerospin/cli --parallel=3` (32 tasks, including shared dependencies). Six pre-existing warnings in untouched explorer UI files remain outside this plan. Nx Cloud access code 401 did not prevent the successful local graph.
2. The explicitly authorized runtime harness (`scripts/verify-plan140.mjs`, removed 2026-10-17) passed six groups against production interfaces and actual in-memory SQLite: independent guards and resource lifetime; operation round trips and foreign/undeclared/family/read-scope refusal; successful-only retry batches and later server failure; result encoding before writes, suspension rollback and complete Cause preservation; standalone asynchronous reads; and both concrete async persistence/producer/delivery/admission paths. The async group exercises actual producer recovery, Date payload decoding, no restart for recorded/replayed work, explicit instance refusal before writes, tampered delivery, retained provenance and equal retry after declarations disappear without initiating command rows.
3. The inference acceptance file (`packages/core/verification/plan140.ts`, removed 2026-10-17) passed with `pnpm exec tsc --ignoreConfig --noEmit --strict --skipLibCheck --target es2022 --module esnext --moduleResolution bundler --exactOptionalPropertyTypes --types node verification/plan140.ts` from `packages/core`. Positive cases and expected refusals cover concrete families/IDs, exact model/operation/payload types, independent read/mutation permission, ordinary/external async exclusion, independent server results, declared business failures and nested/historical Effect requirements.
4. Scoped source/document formatting, lint fixes, source links, source ranges, architecture source hashes, matching diagram annotations and `git diff --check` passed. Archived Plan 099's superseded Channel implementation remains historical evidence; these runtime results verify its approved replacement.

## Remaining work

None.
