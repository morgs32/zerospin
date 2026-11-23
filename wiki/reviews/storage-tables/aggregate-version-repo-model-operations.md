# AggregateVersionRepo.modelOperations

**Reviewed:** 2026-10-15

**Status:** Historical review of the removed Aggregate SQL table. Plan 188 implemented the six-field operation shape and parent timestamp at that stage; Plan 190 subsequently replaced per-operation storage with typed JSON operation arrays in complete packets/history. Reuse body/order/time analysis, not the old SQL-storage verdict.

**Review queue:** [Plan 151](../../plans/151-plan-storage-table-review.md).

**Recalibration (2026-10-15):** The AggregateVersionRepo `modelOperations` table no longer exists. [ADR 013](../../adrs/013-aggregate-delivery-history-and-projection-ownership.md) places packet history in AggregateVersionChain; the body below records the earlier stage.

## Verdict and concrete owner

One immutable row records a forward model mutation produced by this VersionRepo's execution of a command. The physical owner is `{ systemId, aggregateId, aggregateName, aggregateVersion }`; the row belongs to that release's own materialized history. Both original execution and version replay produce model output. This differs from external work, which only original execution retains. [Owner](../../../packages/system-worker/src/AggregateVersionRepo/aggregateVersionRepoName.ts), [output preparation](../../../packages/system-worker/src/AggregateVersionRepo/utils/prepareAggregateOutput.ts).

At the reviewed base commit, the table had **nine declared, nonnullable columns**: seven shared operation fields plus `committedAt` and `aggregateIndex`. Its unique index is `(commandId, operationIndex)`. No application ID, primary-key column, SQL foreign key or extra model metadata is synthesized. [Shared shape/index](../../../packages/system-worker/src/modelOperationShape.ts), [owner declaration](../../../packages/system-worker/src/AggregateVersionRepo/aggregateVersionRepoDbConfig.ts), [table construction](../../../packages/shapes/src/makeTable.ts).

The strongest simplification is separating the stored mutation from context supplied by its parent execution and immutable release. `aggregateIndex` repeats the parent position; `modelVersion` follows from the bound release and model name. The timestamp is actively required, but all operations from one execution share it: retain it once on the owning execution journal rather than delete the information or repeat it on every operation.

The field-by-field evidence below records that pre-cutover declaration. The implemented table now has the six shared mutation columns; its parent journal owns required `executionStartedAt`, and portable output restores the bound release's model version. Completion evidence is retained in Plan 188.

## Every reviewed column

| Column           | Actual purpose and lifecycle                                                                                                                                                         | Disposition                                                                                                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `commandId`      | Command whose execution emitted this model mutation. Source history queries operations by it; receivers check parent association. Immutable.                                         | Retain as the one stored parent locator. The name is clear here because the row has no second command identity.                                                                      |
| `operationIndex` | Zero-based ordinal among the program's complete authored output, including external entries. Orders model changes within the command and completes their unique identity. Immutable. | Retain. Sparse positions are valid; it is not a separate queue counter.                                                                                                              |
| `modelName`      | Chooses the model/table and operation codec within the bound execution release, which can own several models. Immutable.                                                             | Retain. Aggregate identity alone does not identify the model.                                                                                                                        |
| `modelVersion`   | Exact canonical model leaf version encoded by the source; projections compare it with their bound model. Immutable.                                                                  | Derive for complete outgoing operations from the exact owning release and `modelName`; remove the stored copy after preserving source model binding and receiver version validation. |
| `resourceId`     | Identifies the resource created, changed, deleted or moved. Its model-specific ID schema validates it. Immutable.                                                                    | Retain. There is no standard duplicate in the body.                                                                                                                                  |
| `operationName`  | Enum `create`, `update`, `delete` or `move`, selecting body interpretation and application rules. Immutable.                                                                         | Retain. Create/update body shapes alone cannot determine the verb.                                                                                                                   |
| `body`           | Forward operation-specific JSON text, encoded through the model's canonical leaf. Immutable.                                                                                         | Retain. This is the actual mutation data, not a copy of the complete envelope.                                                                                                       |
| `committedAt`    | The occurrence's sampled `startedAt`, used by source application and later as projection `appliedAt`. It is not commit time. Immutable.                                              | Move the exact value to `executedCommands.executionStartedAt`; projection reuses that parent sample for each operation's `appliedAt`. Do not use receipt time.                       |
| `aggregateIndex` | Parent command's aggregate position, written with every operation. Projection checks it against the enclosing result, while source lookup uses `commandId`. Immutable.               | Remove from stored operations. The enclosing journal command already supplies it; reconstruct a complete transport association where needed.                                         |

[Writer/application](../../../packages/system-worker/src/AggregateVersionRepo/utils/applyAggregateOperationsTx.ts), [encoded operation](../../../packages/core/src/contracts/encodeAppliedOperation.ts), [parent lookup/order](../../../packages/system-worker/src/externalOperations/readOperationOutput.ts), [receiver checks](../../../packages/system-worker/src/aggregateProjection/applyEvaluatedCommands/bindProjectionCommand.ts).

## Parent lineage and authored order

The stored unique pair `(commandId, operationIndex)` identifies one authored output slot within this physical execution history. Result paging selects executed commands by aggregate position, then reads their operations by command ID and validates strictly increasing safe nonnegative operation indexes. A sequence such as 0, 2, 5 is valid because omitted external operations keep their positions in the original mixed output. [Result assembly](../../../packages/system-worker/src/AggregateVersionChain/AggregateVersionChain.ts), [sparse output validation](../../../packages/system-worker/src/externalOperations/readOperationOutput.ts).

The repeated aggregate position has no independent query/order responsibility in this table. Its receiver equality check proves current envelope consistency; that does not require persisting the same position on every child. Preserve the stored parent ID and build complete delivered output from the selected parent. Do not remove both parent locators without a replacement association, or replace the current shared operation identity merely to retain the numeric locator.

## Model version follows the bound declaration

Removing a stored version requires a stronger reason than its current duplicate appearance. The relevant source guarantees are concrete:

1. Release construction checks each contract's declared read/mutation models against the exact model objects registered in that database.
2. Evaluation validates the complete recorded operation batch against those declared operation leaves.
3. Each leaf requires the exact model object and its literal model version.

Thus a supported program cannot emit a physically compatible older same-name model through a canonical descriptor. Its owning immutable release plus `modelName` already determines the version. [Exact model membership](../../../packages/core/src/declaration/validateActorContracts.ts#L31-L48), [release validation](../../../packages/core/src/aggregate/make/makeAggregateRelease.ts#L190-L198), [complete output validation](../../../packages/core/src/contracts/evaluateContract.ts#L82-L95), [bound leaf](../../../packages/core/src/contracts/operationCodecs.ts#L175-L225).

Keep the explicit model version in the complete portable operation where codecs/receivers require it. Reconstruct it at source result assembly using this VersionRepo's exact execution release, not the latest release or the command's possibly different original/source release. A generic encoded-operation schema does not require the database row to duplicate all its transport context. Do not weaken model binding or receiver validation when separating those representations.

## Every body variant

`body` is JSON text with operation-specific meaning, not arbitrary application JSON or a full resource snapshot for every verb. [Canonical body codecs](../../../packages/core/src/contracts/operationCodecs.ts#L60-L91).

- **Create:** `{ attributes }` contains the model's complete portable authored attributes. Identity, model metadata and resource timestamps come from the envelope/application context.
- **Update:** `{ attributes }` contains a portable patch. Omitted attributes remain unchanged; undefined patch entries are omitted. An authored maker's optional mask is resolved before persistence and is not another stored field.
- **Delete:** `{}`. The envelope's resource ID identifies what is deleted. Prior resource state is not part of this forward body.
- **Move:** `{ property, prevId, nextId }`. `property` identifies an authored cursor/reference attribute; `prevId` is its expected current value and `nextId` the replacement. These are not automatically neighboring resource IDs. Values must satisfy that attribute's schema; application refuses a current-value mismatch. [Move validation](../../../packages/core/src/contracts/operationCodecs.ts#L239-L262), [move application](../../../packages/core/src/contracts/applyOperationTx.ts#L223-L263).

`applyOperationTx` computes inverse/prior state locally, but this table stores the forward `encodeOperation` result. `inverseOperation` and `previousUpdatedAt` belong to other applied-operation representations and are not missing journal columns. SQL rollback and receiver-local application do not require copying them here.

## Preserve application time while normalizing its location

Before the cutover, one Date was sampled before evaluation for each execution occurrence. Every model operation in that occurrence used the same value for source application and its stored `committedAt`. Create writes it to resource `createdAt` and `updatedAt`; update/move write `updatedAt`. Projection later reuses it as `appliedAt`, so delayed delivery does not change resource timestamps. [Single sample](../../../packages/system-worker/src/AggregateVersionRepo/utils/readAggregateCommandTx.ts), [shared application/storage](../../../packages/system-worker/src/AggregateVersionRepo/utils/applyAggregateOperationsTx.ts#L22-L47), [resource timestamps](../../../packages/core/src/contracts/applyOperationTx.ts), [projection forwarding](../../../packages/system-worker/src/aggregateProjection/applyEvaluatedCommands/bindProjectionCommand.ts).

The value is necessary; per-operation persistence is not. The selected design retains it once as required `executedCommands.executionStartedAt`, atomically with the journal and model output. Result delivery carries the sample on the parent; projection uses it as every operation's `appliedAt`. The journal retains the sample for every finalized execution occurrence, including refusal and zero-output commands, without another nullable state.

Preserve the exact sample. `commandOutcome.recordedAt` is sampled later, after evaluation, and cannot replace it. Replay also samples its own release-local execution time; do not copy the original Chain's observation or use projection receipt time. [Later outcome sample](../../../packages/system-worker/src/AggregateVersionRepo/utils/makeEvaluatedAggregateCommand.ts).

This selected move touches the owning journal's timestamp only; its other columns have a [separate review](aggregate-version-repo-executed-commands.md). Do not resample on committed redelivery. Preserve the decoded parent timestamp before mapping through the core final-command schema, which omits execution-only metadata.

## Execution, projection and integrity boundaries

1. Prepare the full output before application. Resource changes and their encoded model rows share the business savepoint, and the outer synchronous transaction retains command outcome/progress. A later refusal rolls model writes and rows back together. [Business savepoint](../../../packages/system-worker/src/AggregateVersionRepo/utils/executeAggregateCommandTx.ts), [materialization transaction](../../../packages/system-worker/src/AggregateVersionRepo/materializeCommandTx.ts).
2. Both original execution and replay evaluate that release's own program and retain its model output. Replay does not copy another release's operation rows or create external work. Committed command redelivery returns before reevaluation.
3. Result fanout carries parent commands plus ordered complete operations. Projection validates owner/execution release, successful outcome when operations exist, parent association, sparse index order, exact model/version and operation-specific bodies. It applies forward changes transactionally and commits selected browser deltas with projection progress. [Projection validation](../../../packages/system-worker/src/aggregateProjection/applyEvaluatedCommands/bindProjectionCommand.ts), [application](../../../packages/system-worker/src/aggregateProjection/applyEvaluatedCommands/applyEvaluatedCommandsTx.ts), [selected output commit](../../../packages/system-worker/src/aggregateProjection/commitProjectionTx/commitProjectionTx.ts).
4. Browsers receive selected resource upserts/deletions, including preserved metadata, rather than this raw operation journal. Do not conflate it with optimistic rollback storage. [Browser delta application](../../../packages/core/src/aggregateSession/applyOrderedAggregateOccurrencesTx.ts).
5. Disposition hashes bind command identity/order and success/refusal history. They do not hash model bodies, these timestamps or successful result content. Do not claim they authenticate the operation journal or add a new output hash without a separate requirement. [Actual hash tuple](../../../packages/core/src/contracts/dispositionChainHash.ts).

No production update/pruning path for retained model rows was found. Invalid association/body/schema input is refused; this is not an automatic corruption-repair protocol.

## Settled stored shape and limits

```ts
{
  commandId: string;
  operationIndex: number;
  modelName: string;
  resourceId: string;
  operationName: 'create' | 'update' | 'delete' | 'move';
  body: string;
}
```

Preserve unique `(commandId, operationIndex)`. Reconstruct the canonical seven-field portable operation by adding its exact bound `modelVersion`; carry position and execution time once on the parent result. Projection validates parent context, matching operation `commandId`, sparse order, model version and body, then applies using the parent time. Separating row and wire codecs is required; simply deleting fields from the shared encoded-operation protocol would lose existing validation.

Required shared propagation removes only `modelVersion` from Service storage, leaving the common six plus Service's existing `serviceIndex` and `committedAt`. Reconstruct and validate its explicit outgoing model version without moving Service time or removing its position. This dependency propagation does not approve the unreviewed Service table context.

Independent lifecycle/design reviewers traced all nine fields, every body variant, model binding, application time and downstream use. A structural reviewer checked physical columns/indexes and lack of synthesized fields; the primary agent reconciled the normalized design with exact source invariants. The child plan also received independent wire/projection and shared-scope review. No source edits, tests, generated capture or runtime storage inspection were performed by this review.

Base commit: `e551f2dda217753685666442ae29a15e1ef5c719`. Shared model shape SHA-256: `5d462fa7b6441ddb1b3c62c71a471a0313179c408f5a6858b1d25ab64040e415`; aggregate declaration SHA-256: `54983df1f2cc4621b5e52a478f1cc455097491a8e810c0a3edb3beb12f0f09a3`. Other work continues in the checkout; recheck source before implementation.

Implementation and verification are complete in [archived child Plan 188](../../archive/plans/188-plan-aggregate-version-repo-model-operation-storage.md). Changed fixed storage requires empty affected storage, with no compatibility aliases, translation/fallback decoder or automatic reset. The next recorded review is [AggregateVersionRepo.executedCommands](aggregate-version-repo-executed-commands.md).
