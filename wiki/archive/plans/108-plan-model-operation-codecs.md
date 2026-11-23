# 108 — Model-owned operation codecs and exact rollback data

Status: Completed and verified on 2026-10-11. Correlated model-owned operation codecs, receiving refusals and transactional inverse/rollback behavior are verified.

## Source evidence and simpler model

1. [encodeAppliedOperation](../../../packages/core/src/contracts/encodeAppliedOperation.ts) repeats the primitive descriptor switch three times and the forward operation encoder twice. Integer and number descriptors both become `Schema.Number`, weakening authored integer validation at persisted replay boundaries. Forward, inverse and resource schema rules can drift independently.
2. [prepareReplayAppliedOperation](../../../packages/core/src/contracts/prepareReplayAppliedOperation.ts) parses JSON, resolves a model, stringifies the parsed object, decodes a wire codec, then decodes broad object shapes again to construct an operation. Bound and unbound entrypoints repeat phase ownership rather than making an independently supplied wire boundary explicit.
3. [applyOperationTx](../../../packages/core/src/contracts/applyOperationTx.ts) captures update/delete inverse state, but move inverse state trusts `operation.body.prevId` instead of reading the current persisted property. [makeMoveOperation](../../../packages/core/src/contracts/make/makeMoveOperation.ts) accepts any property string and three arbitrary IDs; application uses that property in an unrestricted SQL update. A fabricated prior value can corrupt rollback, and a framework property can change row identity.
4. Give each exact model one derived operation codec set from the same descriptor semantics used for its attributes/resources. Persisted operations are a discriminated forward body plus a matching nullable inverse. Encode the forward body once, encode the operation-specific inverse once, and bind decoded wire bodies directly to the resolved canonical model. Mutation application owns actual prior state.

## Required behavior and intentional changes

1. Model name/version and canonical model identity remain exact. Decoding a wire operation does not adapt it across model versions. Resource IDs use the model's abbreviation codec. Operation indices and timestamps are validated by the owning wire schema; unsafe/fractional positions are rejected where used as ordering cursors.
2. Use the shared shapes descriptor codec for boolean/integer/number/date/enum/JSON/ref/cursor/text semantics, with explicit input-versus-persisted representation. Preserve nullable/default handling and JSON columns' string representation in persistence. Never substitute a transformed decoded value for original retained command bytes.
3. Forward create bodies contain all owned attributes; update bodies contain the already selected attribute patch. Apply an authored mask once when constructing the patch; do not persist redundant mask state after its values have been selected. Explicit undefined/missing patch fields must follow one documented no-change policy, while null remains a real nullable value. Reject unknown attributes at the receiving codec.
4. Move is restricted to an authored ordered cursor/reference property that the actual model descriptor identifies. It cannot mutate id/modelName/version/timestamps or arbitrary scalar fields. Reconcile its public signature with descriptor-derived property/ID types. Capture the actual current property's value for inverse state inside the application transaction; if the submitted previous value remains a precondition, compare it and refuse a mismatch before writing. Do not use supplied previous state as rollback truth.
5. Create inverse is null; delete inverse is the complete prior resource; update inverse is the precise prior patch; move inverse is the actual prior property value. Null inverse for an unapplied/no-op result remains explicit where the existing journal requires it. Decode forward/inverse pairing together so an impossible inverse cannot pass a broad union.
6. Preserve operation order, shared appliedAt, previousUpdatedAt, savepoint rollback, deferred foreign-key commit behavior and reference-refusal classification. SQL infrastructure failures remain infrastructure failures; invalid authored output/wire data uses its specific invalid-operation category. This plan does not move authority to codecs or rerun authored programs during replay.
7. The operation wire body/schema changes deliberately, including removing mask and rejecting formerly accepted malformed integer/move data. Update all first-party writers/readers atomically. Changed fixed storage needs empty storage; no aliases, legacy decoders, migrations or automatic deletion. Public `makeMoveOperation` is exported but has no current first-party call beyond exports/README; enforce its meaningful supported contract rather than inventing an ordering subsystem.

## Complete proposed parent shapes

```ts
const encodeOperation = Effect.fn('encodeOperation')(function* (
  props: IOperationEncodingInput,
) {
  const operation = props.operation;
  const body = yield* encodeForwardOperationBody(operation);
  return {
    commandId: props.commandId,
    operationIndex: props.operationIndex,
    modelName: operation.model.modelName,
    modelVersion: operation.modelVersion,
    resourceId: operation.resourceId,
    operationName: operation.operationName,
    body,
  };
});

const encodeAppliedOperation = Effect.fn('encodeAppliedOperation')(function* ({
  operation,
}: {
  operation: IAppliedOperation;
}) {
  const forward = yield* encodeOperation({ ...operation, operation });
  const inverseOperation = yield* encodeInverseOperationBody(operation);
  return {
    ...forward,
    appliedAt: operation.appliedAt,
    previousUpdatedAt: operation.previousUpdatedAt,
    inverseOperation,
  };
});

const prepareReplayAppliedOperation = Effect.fn(
  'prepareReplayAppliedOperation',
)(function* ({ operation, models }: IReplayPreparationInput) {
  const model = yield* resolveExactOperationModel(models, operation);
  const body = yield* decodeBoundForwardOperationBody(model, operation);
  return {
    model,
    modelVersion: model.version,
    resourceId: operation.resourceId,
    operationName: operation.operationName,
    body,
  };
});

const applyOperationTx = Effect.fn('applyOperationTx')(function* (
  props: IOperationApplicationInput,
) {
  const prior = yield* readOperationPriorState(props);
  const inverse = makeOperationInverse(props.operation, prior);
  yield* applyOperationMutation(props, prior);
  return {
    ...props.operation,
    commandId: props.commandId,
    operationIndex: props.operationIndex,
    appliedAt: props.appliedAt,
    ...inverse,
  };
});
```

1. `operationCodecs(model)` derives or retains one immutable codec set associated with the canonical model; it is not a global schema registry keyed by names. Sharing is safe after [105](105-plan-immutable-authored-declarations.md) seals owned descriptors. Do not cache mutable declarations.
2. Keep exhaustive create/update/delete/move dispatch in `encodeForwardOperationBody`, `encodeInverseOperationBody`, `decodeBoundForwardOperationBody` and focused application/inverse procedures. Each switch narrows the operation before calling the matching `Schema.encodeEffect` or `Schema.decodeEffect` codec. Do not dynamically index a union of incompatible body codecs and then cast away the lost correlation. A discriminated union is clearer than arbitrary callback tables or a new operation class hierarchy; no cast exception is authorized.
3. The independently supplied replay boundary validates its envelope/model/version once. A caller already holding a bound model calls the same body decoder directly after its exact-binding guarantee; remove the second parse/stringify/redecode ceremony. Inverse replay/rollback uses the same codecs.

## File hierarchy and machinery deletion

Legend: `+` create, `~` modify, `-` delete.

```text
zerospin/
├── packages/core/src/
│   ├── + contracts/operationCodecs.ts
│   ├── ~ contracts/{encodeAppliedOperation,prepareReplayAppliedOperation,applyOperationTx,types}.ts
│   ├── ~ contracts/make/{makeUpdateOperation,makeMoveOperation}.ts
│   ├── ~ aggregateSession/applyAggregateBrowserCommand/ — inverse decode/application
│   └── ~ models/make/makeModelVersion.ts — codec derivation ownership
├── packages/shapes/src/ — only the shared descriptor codec if a missing wire policy is proven
├── packages/system-worker/src/ — journal/projection operation writers/readers
├── packages/browser/src/ — optimistic/standalone operation consumers
├── packages/sdk/src/ — public move and operation inference
└── wiki/
    ├── ~ architecture/ — operation persistence/replay/rollback
    └── ~ glossary.md — postimplementation reconciliation
```

1. Delete duplicated primitive switches, duplicated applied forward encoder, JSON parse/re-stringify/redecode phases, persisted update mask and move inverse constructed from submitted prevId. Delete obsolete schema helpers only after all inverse/forward consumers use the model-owned set.
2. Journal-owner and selected-projection plans consume this contract and must not add a second operation serializer. [107](107-plan-contract-evaluation-phases.md) owns private output collection and emission scope; application remains inside the current authoritative or optimistic transaction.

## Implementation and verification

1. [133](133-plan-canonical-descriptor-semantics.md) owns canonical descriptor value semantics, including integer/ref validation and decoded versus encoded Date/JSON policy. Consume its precise schemas to derive paired model operation codecs; do not copy its primitive switches. Convert forward/inverse readers before deleting old constructors. Implement update patch normalization and restricted move preconditions/inverse capture.
2. Convert authoritative execution, projection replay, optimistic rollback and standalone storage together. Inspect all journal schemas and full reachable rollback paths; fixed schema consequences must be explicit in their owners' plans. Preserve originating command identity and required transaction sequencing.
3. Reuse actual model/operation constructors, in-memory SQLite, existing command/projection seams and existing examples. Exercise nullable JSON/date/integer/ref values, partial updates/masks, malformed body/inverse pairings, exact model/version binding, move precondition refusal and rollback restoration after a later batch failure. Create no test/check files, fixtures or configuration.
4. Resolve and run applicable core/shapes/SDK/server/browser Nx gates after implementation; no production checks were run in this review. There is no first-party move workflow that proves desired ordered-list behavior beyond the current generic mutation API; this proposal does not claim one.
5. Reconcile operation README examples, source-linked workflow diagrams and existing glossary after implementation. The wire/storage contract trade-off may warrant an ADR if the implemented choice satisfies all repository criteria; do not write one in planning. Archive after required verification completes.

## Completion evidence — 2026-10-11

- Final quality8 framework library/type/lint and consumers5 Native/Shopping/TicTacToe checks pass after all repairs. Core's actual typecheck5 passes with `--skipSync` for existing Nx project-reference drift; Swift3/iOS-build3 and Explorer2 gates pass. The framework graph has no source warnings; Explorer retains six pre-existing UI warnings.

2. The successful actual SQL.js operation probe establishes mask selection, undefined omission versus explicit nullable JSON/Date changes, precise update inverse capture/portable encoding, move precondition refusal, move inverse restoration and whole-batch rollback. The final permitted inline codec command completed with 11 assertion groups: complete and nullable create bodies with integer/finite Number, Date/transformed nested JSON and text/numeric refs; omitted defaulted values and malformed values refused; patch omission/null and retired mask refusal; exact replay model name/version/resource ID; all four forward/inverse round trips with exact canonical Model binding; explicit null inverses; malformed paired inverses at both encoding and receiving decoding; move property/value restrictions; decoded/portable timestamps and ordering positions; and delete extra-key refusal at forward encoding, paired encoding, replay, paired decoding and decoded Type validation. That last assertion exposed Effect empty Struct acceptance, repaired by the single model-owned delete codec; the entire matrix was rerun successfully afterward. No required operation-specific bounded case remains identified. The original plan permits these pure/SQL.js checks without new files; they establish this operation contract, not durable worker or native lifecycle acceptance.
3. Operation READMEs and source-linked architecture/glossary are reconciled; the final documentation and source-citation audit passes. No permanent tests or fixtures were added. First-party move has no ordered-list application workflow; the defined contract remains its constrained mutation and rollback behavior. Changed operation journals require empty storage.

## Remaining work

None. Required bounded runtime cases, affected source and consumer checks, and documentation reconciliation are complete.
