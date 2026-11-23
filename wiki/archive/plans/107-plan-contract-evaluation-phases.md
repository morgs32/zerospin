# 107 — Contract evaluation with explicit inputs and outputs

Status: Completed and verified on 2026-10-11. Archived after the required evaluator checks, configured Workerd producer/completion workflow and current shared source/consumer gates passed.

## Current problem and proposed model

1. [evaluateContract](../../../packages/core/src/contracts/evaluateContract.ts) normalizes two database capabilities, selects original or mapped declarations, runs a guard, collects and validates ordinary emissions, encodes an original result, freezes mapper inputs, runs a mapper, validates external emissions, checks owner model membership and encodes the final result. Its one mutable `operations` array successively represents several different phases. A smaller function that moves this body behind a generic runner would preserve the confusion.
2. The removed `prepareContractInput` returned values through a shallow `Schema.declare` type projection and duplicated an ordinary-only implementation. Its surviving replacements are [prepareOrdinaryInvocation](../../../packages/core/src/contracts/prepare/prepareOrdinaryInvocation.ts) and [prepareExternalInvocation](../../../packages/core/src/contracts/prepare/prepareExternalInvocation.ts). Ordinary/external distinction is rediscovered inside runtime preparation even after the owning workflow already selected a declaration. Payload version selection, adapter execution, claims decoding, guards and business rejection have different owners and must remain explicit.
3. Replace the mutable mixed pipeline with prepared invocation → original output → optional mapped output → validated owner output. Each value carries the declaration and exact read capability appropriate to its phase. Ordinary and external invocation preparation are distinct domain procedures; they share claims preparation and the existing payload/response codecs. Execution receives a prepared invocation and one restricted read capability, rather than an arbitrary physical database union.

## Required observable behavior

1. Resolve a declaration and payload version before execution. Preserve authored payload up/down adapters and current payload defaults; an immutable retained duplicate still bypasses fresh declaration preparation at admission. Preparation never applies operations or changes a command's original encoded payload bytes.
2. Ordinary preparation refuses external response fields; external preparation requires its declared response. Aggregate invocation requires its aggregateId; service invocation has no fabricated aggregate identity. Claims are decoded against the exact selected declaration's codec. These input guarantees are schemas, not business verdicts.
3. A guard runs before the program. Programs and mappings remain lazy Channels, ordered private collections. No collected output is visible to application persistence until the complete program, result, mapping and owner binding succeed. An ordinary program cannot emit async operations.
4. Mappers receive an immutable snapshot of the original command payload, original operations and original result. Their output replaces original operations and result rather than appending partially validated emissions to a shared array. A mapper can emit only exact external declarations registered on its own mapping and owner. Preserve model identity/version membership for original, mapped and final owning release scopes.
5. Keep business failures validated against their declaration and scope. `runAuthoredCallback` remains the single callback policy for sole typed refusals; preserve full composite Cause, defects and interruption. Result/failure codecs continue to execute without borrowing arbitrary runtime services. Do not introduce a second runtime or convert unexpected defects into ordinary business refusals.
6. Server original execution, canonical VersionRepo replay, local optimistic stage/rebase and validation rehearsal complete synchronously inside their owning SQLite transaction/savepoint. Their restricted read capability must complete synchronously there; a host driver's asynchronous SQL interface does not authorize suspending an authored program inside that boundary. Canonical VersionRepo replay evaluates that release's own guards/programs against the finalized input prefix, as preserved by [118](118-plan-version-result-owner.md), and never starts external producers. Selected-view and Node/session replay of retained final operations applies those operations without authored callbacks; optimistic rebase of still-pending originals evaluates their programs again. Host transport and an external producer may await outside synchronous transactions; the producer records its response before external completion. The evaluator has no storage commit or retry responsibility. [117](117-plan-session-reconciliation-and-evaluation.md) owns the local savepoint/suspension policy.
7. Internal signatures deliberately change to accept a prepared invocation and restricted reads. Receiving RPC/SDK boundaries still own independently supplied data validation. Remove shallow schemas used solely as type casts and the duplicated ordinary-preparation body; retain public generic inference and actual runtime validation without adding `ALLOWED_CAST`.

## Complete proposed parent shapes

```ts
const prepareOrdinaryInvocation = Effect.fn('prepareOrdinaryInvocation')(
  function* (declaration: IOrdinaryContract, input: IOrdinaryInvocationInput) {
    const payload = yield* prepareOrdinaryPayload(declaration, input);
    const claims = yield* prepareContractClaims(declaration, input.claims);
    return { declaration, payload, claims, aggregateId: input.aggregateId };
  },
);

const prepareExternalInvocation = Effect.fn('prepareExternalInvocation')(
  function* (declaration: IExternalContract, input: IExternalInvocationInput) {
    const arguments_ = yield* decodeExternalResponse(
      declaration.payload,
      declaration.external,
      input.payload,
      input.response,
    );
    const claims = yield* prepareContractClaims(declaration, input.claims);
    return {
      declaration,
      ...arguments_,
      claims,
      aggregateId: input.aggregateId,
    };
  },
);

const evaluateContract = Effect.fn('evaluateContract')(function* (
  invocation: IPreparedInvocation,
  ownerReads: IContractReadDb,
) {
  const original =
    invocation.declaration.mapping?.original ?? invocation.declaration;
  const reads = scopeContractReadDb(ownerReads, original.models);
  yield* runContractGuard(original, { ...invocation, db: reads });
  const originalOutput = yield* collectOriginalOutput(
    original,
    invocation,
    reads,
  );
  const output =
    invocation.declaration.mapping === undefined
      ? originalOutput
      : yield* evaluateContractMapping(invocation, originalOutput, ownerReads);
  yield* validateOwnerOutput(output, ownerReads.models);
  return output;
});

const collectOriginalOutput = Effect.fn('collectOriginalOutput')(function* (
  declaration: IContract,
  invocation: IPreparedInvocation,
  reads: IContractReadDb,
) {
  const collected = yield* collectContractProgram(
    declaration,
    invocation,
    reads,
  );
  yield* validateOrdinaryEmissions(declaration, collected.operations);
  const encodedResult = yield* encodeContractResult(
    declaration,
    collected.result,
  );
  return { contractVersion: declaration.version, ...collected, encodedResult };
});

const evaluateContractMapping = Effect.fn('evaluateContractMapping')(function* (
  invocation: IPreparedMappedInvocation,
  original: IEvaluatedOrdinaryOutput,
  ownerReads: IContractReadDb,
) {
  const mapping = invocation.declaration.mapping;
  const command = snapshotMappingInput(invocation, original);
  const reads = scopeContractReadDb(ownerReads, mapping.models);
  const mapped = yield* collectMappingProgram(
    mapping,
    command,
    invocation,
    reads,
  );
  yield* validateMappedEmissions(mapping, mapped.operations);
  const encodedResult = yield* encodeContractResult(
    invocation.declaration,
    mapped.result,
  );
  return {
    contractVersion: invocation.declaration.version,
    ...mapped,
    encodedResult,
  };
});
```

1. Collector procedures own one private ordered Channel collection and callback failure policy. They do not apply mutations, collect telemetry manually or become a generic Effect/Channel runner. Keep collection inline in its focused phase if an additional function adds no responsibility.
2. `snapshotMappingInput` owns cloning/freezing serializable operation bodies and payload/result snapshots. It preserves canonical model/contract references and does not freeze executable objects or live database capabilities.
3. Owner-specific invocation types express required aggregateId and external response. Use ordinary narrowing and declaration construction guarantees. The sketches show complete parent order; implement precise overloads and inferred services/errors rather than coercing an erased union.

## File hierarchy and exact deletion

Legend: `+` create, `~` modify, `-` delete.

```text
zerospin/
├── packages/core/src/contracts/
│   ├── ~ {types,evaluateContract,prepareContractInput,runContractGuard}.ts
│   ├── + evaluate/{collectOriginalOutput,evaluateContractMapping,snapshotMappingInput}.ts
│   ├── + prepare/{prepareOrdinaryInvocation,prepareExternalInvocation,prepareContractClaims}.ts
│   └── ~ README.md
├── packages/core/src/{aggregateSession,serviceSession}/ — prepared invocation callers
├── packages/system-worker/src/{AggregateVersionRepo,ServiceVersionRepo,asyncOperations}/
├── packages/browser/src/ — optimistic and standalone execution callers
└── wiki/
    ├── ~ architecture/ — original/mapped/external execution sequence
    └── ~ glossary.md — postimplementation reconciliation
```

1. Delete discarded `Schema.declare<IPreparedContractInput>` return decoding, duplicated ordinary preparation, evaluator physical-db normalization, shared mutable mixed operation accumulation and repeated original-result encoding in the unmapped path. Do not retain old entrypoint aliases or both invocation interfaces.
2. Preserve existing authored Channel API and `runAuthoredCallback`; [099](099-plan-channel-contract-programs.md) owns its pending independent verification. This proposal is a subsequent evaluator responsibility change, not a claim that 099 is complete. Completed [101](101-plan-remove-aggregate-server-staging.md) records the staging cutover; no server staging is restored.
3. [102](102-plan-aggregate-command-admission-orchestration.md) continues to own ordinary admission ordering/duplicate recovery. [108](108-plan-model-operation-codecs.md) owns operation codecs; this plan validates emission ownership before those codecs and persistence.

## Implementation sequence and existing verification seams

1. Introduce prepared invocation/output types and phase procedures using current codecs/callback policy. Convert server and optimistic callers to supply restricted reads explicitly. Preserve per-phase model and external identity checks before deleting old branches.
2. Replace evaluator orchestration, remove obsolete preparation signatures and update all callers directly. Verify original-versus-mapped return semantics, private collection order, exact external emission registration and result codec counts.
3. Reuse existing Shopping/Tic-tac-toe/Studio contracts, current command execution procedures, real in-memory SQLite and existing Channel verification seams. Exercise guard failure before program invocation, malformed/foreign operations, mapper mutation attempts, mapper/result refusal, async suspension under a synchronous savepoint, rollback and full Cause propagation. No tests, fixtures, check runners or configuration may be created.
4. Run only applicable resolved core/server/browser/SDK/example Nx gates after implementation. This source review ran no production checks. Full remote external-producer behavior still requires its existing Workerd/runtime seam; an in-memory callback probe alone does not establish that behavior.
5. Reconcile READMEs, workflow diagrams, source citations and glossary after implementation. Add an ADR only if the implemented execution contract trade-off satisfies the repository criteria; none is required for ordinary procedure extraction alone. Archive after required implementation and verification complete.

## Implementation progress — 2026-10-11

Prepared ordinary/external invocations, guard/original/replacement mapper collections, exact owner emission checks and one final result encoding are implemented. Disposable source probes passed guard-before-program order, replacement output, mapper snapshot isolation, exact declaration/model scope, one encoding, ordinary/external preparation and composite typed failure/defect preservation. Actual SQLite savepoint probes passed suspension cancellation without late writes and typed failure/defect/interruption Cause preservation under rollback. Shopping/Tic-tac-toe mappers explicitly preserve original output with its complete model inventory. Scoped lint passed with zero warnings/errors.

The explicitly permitted inline evaluator matrix now passes all 25 cases through the existing constructors, operation Channels, prepared invocation, restricted read capability and evaluator APIs. Ordinary and mapped collections refuse malformed envelopes, wrong model versions, empty/prototype-forged Models and a distinct completed Model with equal name/version; ordinary async emission refuses. Mappers refuse unregistered equal-name external declarations, structural copies and missing external capabilities. Ordinary/mapped result codec refusals, declared/foreign/framework mapper refusals, original/mapped/final owner-model scopes, a mapper defect and ordered composite Fail/Die payload identity all pass. Effect's added trace annotations are retained; failure reasons and original payload identities remain intact. A valid mapped external emission returns replacement operations/result without accumulating the original operation. No persistence or external producer runs in this matrix; operation-body codec validation remains owned by108, and remote producer behavior is not established here.

The existing TicTacToe public authentication, session authorization and real WebSocket workflow now establishes the configured remote producer happy path. Actual first-party staging and a newly factory-created SQL.js-backed Node accepted `playX@1.0.0` command `cmd_rwoWhZSC-VxbH8ukAeKEA` against the retained empty game. Its mapped output committed the original model update at operationIndex0 and the exact registered `asyncPlayO@1.0.0` emission at operationIndex1, with aggregate owner `game@1.0.0` and original human actor provenance. The configured `deterministicComputerMove` producer returned1; the VersionRepo retained that response and its recording time before actual child `cmd_j18wjP2oKYeE2XEqo43LV` completed at aggregateIndex3. The selected graph progressed through `X........` to `XO.......`, turnX, with retained successful finalizations. Public inspection and post-shutdown read-only physical SQLite inspection agree on the three source/result commands, three model operations, one recorded async operation and empty delivered outbox. Evidence is in `/tmp/zerospin-goal-107-118-tictactoe-play.log`, `/tmp/zerospin-goal-107-118-tictactoe-journal.log` and `/tmp/zerospin-goal-107-118-physical-retention.log`. This is an actual configured producer/recorded-completion workflow; it does not count producer invocations or establish fault/restart recovery, which118 owns.

The later replay assertion found a separate Node journal correlation defect before the unsent second player's command reached the server. The completed mapped/producer assertions above remain valid; no failed aggregate occurrence was established. Plan116 owns the correlated SQL repair and its verification. Both real client Node/session scopes, sockets and SQL.js databases were closed. The owned TicTacToe CLI and both Workerd processes then stopped with the existing Nx runtime exiting0; its generated configuration was removed, all17 prior configuration identities/mtimes matched, and all56 protected original storage files retained their exact hashes and filesystem identities (`/tmp/zerospin-goal-107-118-cleanup.log`). No production source, authored declarations, credentials, fixtures, runners or configuration were created for these requests.

### Verified source gates — 2026-10-11

The final fourteen-project library, TypeScript and lint graph passes with no source warnings (`/tmp/zerospin-goal-quality-8.log`). Native, Shopping and TicTacToe build/type/lint pass (`/tmp/zerospin-goal-consumers-5.log`); Explorer build/actual typecheck/lint pass with six pre-existing UI warnings (`/tmp/zerospin-goal-explorer-2.log`). Core's actual `tsc:typecheck` passes with `--skipSync` for existing project-reference synchronization drift (`/tmp/zerospin-goal-core-typecheck-5.log`). Actual Swift package and iOS app builds pass (`/tmp/zerospin-goal-swift-3.log`, `/tmp/zerospin-goal-ios-build-3.log`). Nx Cloud code401 does not prevent local verification. Runtime evidence and any remaining criteria are recorded separately.

The coordinated source gates after the neighboring Node correlation repair also pass: the fourteen-project library/type/lint graph (`/tmp/zerospin-goal-node-correlation-quality-2.log`), actual core `tsc:typecheck --skipSync` (`/tmp/zerospin-goal-node-correlation-typecheck.log`) and native/Shopping/TicTacToe build/type/lint (`/tmp/zerospin-goal-node-correlation-consumers.log`). No evaluator requirement remains open.

## Remaining work

None. Required evaluator behavior, configured remote producer/completion, source/consumer gates and documentation reconciliation are verified. Plans116/118 retain their separate Node-host and durable recovery requirements.
