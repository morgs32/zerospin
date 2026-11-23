# AggregateVersionRepo.asyncOperations

**Reviewed:** 2026-10-15

**Status:** Historical review of the former `asyncOperations` table. Plan 159 implemented that stage; completed Plan 190 replaced it with pending `externalOperationOutbox`, whose request is deleted on atomic transfer to a complete observed command. Parent lineage lasts only while delivery is pending. The replacement needs a fresh purpose review.

**Review queue:** [Plan 151](../../plans/151-plan-storage-table-review.md).

**Recalibration (2026-10-15):** [ADR 013](../../adrs/013-aggregate-delivery-history-and-projection-ownership.md) governs the implemented replacement. The body below is the earlier permanent-work review, not the current external-request lifecycle.

**Implementation subplan:** [Plan 159](../../archive/plans/159-plan-aggregate-version-repo-async-operation-storage.md).

The source snapshot below records the eleven-field representation before this cleanup. The selected model retains `(initiatingCommandId, operationIndex)` lineage, external contract identity, payload, continuation identity, Origin and external outcome.

## Verdict and concrete owner

One row is a frozen external invocation emitted by original command execution, later augmented with its first external observation. It is the durable handoff from a committed synchronous program to an external request and then a continuation command.

The containing Repo owns `{ systemId, aggregateId, aggregateName, aggregateVersion }`. Original execution alone retains external work; another release replaying the same command does not create or run another request. The containing release supplies declaration lookup and the continuation's originating release. [Physical owner](../../../packages/system-worker/src/AggregateVersionRepo/aggregateVersionRepoName.ts), [original/replay preparation](../../../packages/system-worker/src/AggregateVersionRepo/utils/prepareAggregateOutput.ts).

The table has **11 declared columns**, ten immutable input/provenance fields and one observation field that changes once from null. Nine fields come from the shared declaration; the aggregate declaration replaces that table with the shared shape plus `aggregateId` and `aggregateIndex`. No additional `id` or primary key is synthesized. SQLite's intrinsic rowid is not a declared framework column. [Shared declaration](../../../packages/system-worker/src/externalOperations/externalOperationsDbConfig.ts), [aggregate override](../../../packages/system-worker/src/AggregateVersionRepo/aggregateVersionRepoDbConfig.ts), [table construction](../../../packages/shapes/src/makeTable.ts), [optional primary-key resolution](../../../packages/shapes/src/resolvePrimaryKey.ts).

The strongest simplifications are removing `aggregateId`, `aggregateIndex` and `committedAt`. Clearer names would distinguish the initiating command from the continuation and identify the frozen declaration as an external contract. The frozen payload, Origin, declaration version, stable continuation identity and first observation have independent recovery/proof roles.

## Every column

| Column                 | Actual purpose and lifecycle                                                                                                                                                                                     | Disposition                                                                                                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `commandId`            | Initiating command ID, captured during original output preparation. With `operationIndex`, records a unique parent output slot. No current request/proof lookup uses it. Immutable.                              | Retain explicitly for parent lineage and output-slot uniqueness; rename `initiatingCommandId`. Do not claim it deduplicates provider calls.                  |
| `operationIndex`       | Zero-based position among all authored operations, including model changes. Paired with the initiating command in a unique index; gaps between external entries are valid. Immutable.                            | Retain for the emission-slot invariant. It does not order external execution or continuation admission.                                                      |
| `asyncContractName`    | Exact external declaration selected within the containing release; becomes the continuation's command name. Immutable.                                                                                           | Retain as `externalContractName` for a clearer domain name.                                                                                                  |
| `asyncContractVersion` | Exact external declaration version, checked before request execution and retained in the continuation without a live declaration lookup. Immutable.                                                              | Retain as `externalContractVersion`. The containing aggregate release does not replace this explicit frozen contract identity.                               |
| `payload`              | Frozen contract-encoded portable JSON arguments for this external invocation, not the initiating command's complete payload. Decoded for the request and serialized into continuation input. Immutable.          | Retain. Authored payload fields remain opaque to framework routing.                                                                                          |
| `committedAt`          | Date stored as epoch milliseconds, copied from `occurrence.startedAt` before program evaluation. No production request/order/timeout/proof/result-history reader was found. Immutable.                           | Remove. It is not commit time and has no current control purpose. Do not merely rename and retain an unused timestamp.                                       |
| `asyncCommandId`       | Unique stable `cmd_…` ID generated once when scheduling. Used for live reservations, work lookup, outcome recording, outbox references and complete-child proof; becomes the continuation command ID. Immutable. | Retain as `continuationCommandId`. It already identifies the work item and future child; add no second work ID.                                              |
| `origin`               | Frozen actor/agent/System authority, copied unchanged into the continuation. Immutable.                                                                                                                          | Retain. Reconstructing it from the initiating command would undo the settled independent frozen-work boundary.                                               |
| `externalOutcome`      | Null while no observation is recorded; otherwise the first Success/content or Failure/public request failure, with its recording time. Drives request recovery and continuation readiness.                       | Retain the settled structured representation. The first committed observation wins; recorded work is never rerun merely because continuation delivery fails. |
| `aggregateId`          | Repeats the physical owner; checked against the same bound key before request resolution and prepared-child proof. Immutable.                                                                                    | Remove. Preserve owner validation at ingress; derive continuation identity from the containing Repo key.                                                     |
| `aggregateIndex`       | Initiating command's aggregate position, written when output applies. No production async-row reader was found. Immutable.                                                                                       | Remove. It is a second parent locator; the initiating command journal already supplies its position if inspection needs it.                                  |

[Preparation](../../../packages/system-worker/src/externalOperations/prepareExternalOperation.ts), [aggregate output preparation](../../../packages/system-worker/src/AggregateVersionRepo/utils/prepareAggregateOutput.ts), [retention](../../../packages/system-worker/src/AggregateVersionRepo/utils/applyAggregateOperationsTx.ts), [runner/observation recording](../../../packages/system-worker/src/externalOperations/makeExternalOperationQueue.ts), [child reconstruction](../../../packages/system-worker/src/externalOperations/readPreparedExternalCommand.ts).

## Two command identities and the parent output slot

`commandId` and `asyncCommandId` refer to different commands. The first emitted this work; the second will be admitted after the external observation records. A command can emit several requests, and each receives its own stable continuation ID. Each continuation can itself emit later work.

The current table has a unique `command_operation(commandId, operationIndex)` index and a separate unique continuation ID. The former preserves parent lineage and prohibits two retained invocations at the same authored output slot. The latter is the operational identity used by request recovery and proof. No SQL primary key is required by the current protocol. Despite its descriptor name, `primitives.foreignKey({ abbreviation: 'cmd' })` here creates branded text, not a SQL `REFERENCES` constraint. [Index/ID declaration](../../../packages/system-worker/src/externalOperations/externalOperationsDbConfig.ts), [primitive mapping](../../../packages/shapes/src/primitiveMaps.ts).

Normal committed-command redelivery already returns before evaluating its program again, and resource/work/result writes share the original transaction. Therefore the parent pair is not what prevents repeated requests after command redelivery. The maintainer chose to retain it for the narrower lineage/uniqueness requirement. It is not a provider retry guarantee. [Committed progress check](../../../packages/system-worker/src/AggregateVersionRepo/utils/readAggregateCommandTx.ts), [materialization transaction](../../../packages/system-worker/src/AggregateVersionRepo/materializeCommandTx.ts).

`operationIndex` is the position in the complete authored output, not a dense ordinal among external requests. It also does not establish request order: distinct work items run concurrently and their continuations can arrive in observation/delivery order. Do not preserve `aggregateIndex` as an imagined external scheduling cursor.

## Structured column meanings

`payload` is JSON encoded using the exact external contract's payload codec. Its application/provider-specific keys are defined by that contract, not by this table. It may describe a provider request or an authenticated cross-owner command without becoming a framework continuation address. Request resolution validates/decode this frozen input; child reconstruction uses it without the initiating command or a live external declaration. [Descriptor preparation](../../../packages/system-worker/src/externalOperations/prepareExternalOperation.ts), [request decode](../../../packages/system-worker/src/externalOperations/makeExternalOperationQueue.ts), [reconstruction](../../../packages/system-worker/src/externalOperations/readPreparedExternalCommand.ts).

`origin` contains exactly one supported authority variant:

- Actor: `kind: 'actor'`, `actorName`, `actorVersion`, and complete `claims`. These freeze actor declaration and invocation authority.
- Agent: `kind: 'agent'`, `agentName`, and `agentVersion`. These freeze the originating agent declaration.
- System: `kind: 'system'`, with no placeholder identity.

There is no initiating Node/session/push position in Origin. The continuation deliberately uses an all-null producer tuple. Actor claims are authored authority data, not another framework routing envelope. [Canonical Origin schema](../../../packages/core/src/contracts/OriginSchema.ts).

`externalOutcome` has these existing branches:

```ts
{ _tag: 'Success', success: Json, recordedAt: Date }
{ _tag: 'Failure',
  failure: {
    _tag: 'ExternalRequestFailure',
    code: 'external-producer-failed',
    message: string
  },
  recordedAt: Date }
```

The outer `_tag` distinguishes usable encoded content from failure to obtain it. `success` uses the exact external response codec and can be JSON null, which is distinct from an absent SQL outcome. The failure's tag/code are its fixed public classification; `message` is the public description, currently generic, not the private request Cause. `recordedAt` is sampled after request/response-codec settlement and before the recording transaction; JSON encoding stores it as a date string. It is an observation recording time, not an exact database commit instant. [Outcome schema](../../../packages/core/src/contracts/ExternalOutcomeSchema.ts), [observation capture](../../../packages/system-worker/src/externalOperations/makeExternalOperationQueue.ts).

Both branches are already selected under [Plan 152](../../archive/plans/152-plan-aggregate-chain-command-storage.md) and [ADR 012](../../adrs/012-opaque-external-work-and-originating-chain-continuations.md). External failure establishes no usable response, not that a remote effect did not happen. Its authored continuation can still finish successfully. Do not reinterpret it as the initiating command's failure or as a signal to repeat recorded external work.

## Transaction and recovery lifecycle

1. Original program output is prepared synchronously before application. The exact canonical external declaration must be registered in the executing release. Work insertion shares the business savepoint with resource changes; the outer transaction retains the command outcome/progress. Rollback cannot leave emitted requests detached from their committed parent. Replay discards async descriptions before preparation. [Business savepoint](../../../packages/system-worker/src/AggregateVersionRepo/utils/executeAggregateCommandTx.ts), [output application](../../../packages/system-worker/src/AggregateVersionRepo/utils/applyAggregateOperationsTx.ts).
2. The alarm hold is armed before the original execution callback. Requests start afterward, outside the SQL transaction and execution gate. Recovery scans `externalOutcome IS NULL` and keeps one live reservation per continuation ID until request finalizers, recording and cleanup settle. A scheduled task rechecks durable pending state before invocation. The persisted row does not distinguish queued from in-flight work. [Owner integration](../../../packages/system-worker/src/AggregateVersionRepo/AggregateVersionRepo.ts), [runner](../../../packages/system-worker/src/externalOperations/makeExternalOperationQueue.ts).
3. Pending request resolution uses the containing aggregate release plus the frozen external name/version and payload. Declaration/payload-resolution failures remain recoverable infrastructure failures. Request failure, timeout or successful-response codec failure instead records an external Failure. Request defects and live interruption also enter that branch after producer finalizers settle; outcome recording and cleanup are protected from interruption. This differs from process loss before recording, which can leave work pending for another invocation. The configured timeout bounds the complete authored request, including its retry waits; `committedAt` is not used to calculate it.
4. One synchronous transaction records the first outcome, allocates a continuation outbox position and inserts that delivery entry. Both branches enqueue. Recording failure rolls the transaction back and remains an infrastructure failure; if the producer also failed, both Causes are preserved. A later attempt cannot replace a committed observation. Pending, recorded-awaiting-delivery and delivered states follow from outcome plus outbox membership, without another status field. [Atomic recording](../../../packages/system-worker/src/externalOperations/makeExternalOperationQueue.ts).
5. The recorded child is rebuilt from frozen evidence and the bound key, with its stable ID and original release. The originating Chain fetches that complete child from the source VersionRepo and compares the entire submitted command before fresh local retention. Exact retained retries precede current declaration checks. Reconstruction itself needs neither the initiating command nor a live declaration; fresh admission and execution still validate their own authority/declaration requirements. [Prepared child](../../../packages/system-worker/src/AggregateVersionRepo/getPreparedExternalCommand/getPreparedExternalCommand.ts), [complete-child proof](../../../packages/system-worker/src/externalOperations/verifyExternalCommandDeliveries.ts).
6. Delivery acknowledgement deletes only the outbox entry. Work/observation evidence stays retained; no production pruning path was found. Delivery recovery runs independently of blocked requests. The alarm remains armed while precommit callbacks, unrecorded work or pending deliveries remain. `runs.delete` releases an in-memory reservation, not a durable row.
7. Process loss after an external effect but before outcome recording can cause another request invocation. Stable continuation identity does not promise provider exactly-once execution; authors own remote idempotency/reconciliation. Recorded outcomes never overwrite the initiating command's result.

## Selected simplification

Remove the three unjustified fields, retain the explicit parent emission-slot invariant, and clarify names:

```ts
{
  initiatingCommandId: string;
  operationIndex: number;
  externalContractName: string;
  externalContractVersion: number;
  payload: Json;
  continuationCommandId: string;
  origin: Origin;
  externalOutcome: ExternalOutcome | null;
}
```

This is the selected eight-field model, not a new codec/type API. Preserve both current uniqueness invariants. The parent pair records lineage and uniqueness per emitted operation; the other six fields carry standalone execution/reconstruction state. Do not assert the parent pair is required for provider retry.

The table's existing name and settled frozen-work boundary need no new routing abstraction. Any selected shared-schema change must propagate to actual service consumers without treating ServiceVersionRepo's separate table context as reviewed. Do not borrow model-operation history requirements: current result-history readers select only `modelOperations`, so their ordering/timestamps do not justify these async columns. [Result output reader](../../../packages/system-worker/src/externalOperations/readOperationOutput.ts).

## Evidence and remaining work

Independent lifecycle and design reviewers examined all columns and recovery paths; a third reviewer checked schema synthesis, physical constraints, generic readers and retention. The primary agent reconciled the findings against current source. No source edits, tests, generated capture or live storage inspection were performed by this review.

Base commit: `7184c8ed01f6a78e84b7818186fcb0a9b3c6f98b`. Shared async declaration SHA-256: `422f34b6650532b9dff2e9abb48d9097efe8e0bf3b3c6c36228fb8c4ae4179ef`; aggregate declaration SHA-256: `d785d4814a1e79ba394bd77364e4d1d798df1e4faf923185d9ffe4c38ce95137`. Other chats are updating shared Origin/service code; recheck source before implementation.

Implement and verify the selected removals, renames and retained lineage through Plan 159. Changed fixed storage requires empty affected storage, with no aliases, fallback decoders, translation migration or automatic reset. The next table is recorded separately in the [asyncCommandOutbox review](aggregate-version-repo-async-command-outbox.md).
