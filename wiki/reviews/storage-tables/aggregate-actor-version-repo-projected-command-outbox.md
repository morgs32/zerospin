# AggregateActorVersionRepo.projectedCommandOutbox

**Later implementation:** [Plan 207](../../archive/plans/207-plan-actor-model-exposure-and-aggregate-command-names.md) incorporates this six-column recommendation with the accepted names `exposedCommandOutbox` and `commandResolution`, plus normalized retained Actor history and the corresponding Service design. The dated finding below records the source and scope at review time; it does not independently purpose-review the new retained relations or Service occurrences. Aggregate Agent physical storage remains unchanged.

**Reviewed:** 2026-10-15 against current source. Exactly this physical owner/table occurrence was reviewed; projection resources/head, selected-history append and private replay were dependencies.

**Verdict: retain complete pending selected publication; simplify private completion into one nullable object.** Recommend five required public columns (`aggregateIndex`, `dispositionChainHash`, `id`, `commandName`, `delta`) plus nullable `completion` containing Node, push position, session, full original claims and nullable public failure. Reconstruct fixed actor Origin fields from the bound owner at publication. This preserves every independent pending fact while replacing five coupled nullable columns with one private-completion unit.

**Decision status:** Recommendation only. Current source has ten columns and a full nullable `completionOrigin`. No ordinary-path correctness defect was found. This review authorizes no implementation or change to the separately unreviewed agent occurrence or AggregateActorVersionChain's physical history schema.

**Review queue:** [Plan 151](../../plans/151-plan-storage-table-review.md). **Architecture:** [ADR 013](../../adrs/013-aggregate-delivery-history-and-projection-ownership.md) and [ADR 016](../../adrs/016-aggregate-original-operations-and-external-work.md). Related: [actor materialization head](aggregate-actor-version-repo-materialization-head.md).

## Physical scope and represented fact

AggregateActorVersionRepo is bound to `systemId / aggregateId / aggregateName / aggregateVersion / actorName / actorVersion / actorPath`. One row is one complete selected command awaiting durable append to that exact view's AggregateActorVersionChain. Its resource transaction has committed; selected-history publication has not yet been acknowledged locally.

This is **complete pending delivery**, not retained projected history or an index-only publication marker. Resource changes, the materialization head and every selected publication for a delivered page commit together. After AggregateActorVersionChain acknowledges retention, this row is deleted; the local head and permanent Chain history remain.

- [Bound owner](../../../packages/system-worker/src/AggregateActorVersionRepo/aggregateActorVersionRepoName.ts#L7-L11), [pending table declaration](../../../packages/system-worker/src/aggregateProjection/aggregateProjectionDbConfig.ts#L8-L11), [atomic publication/head writes](../../../packages/system-worker/src/aggregateProjection/commitProjectionTx/commitProjectionTx.ts#L70-L99).

## Current ten columns

Five columns are required and five are nullable. Supported writes freeze the entire row until acknowledgement deletes it; no retry changes the message body. None has an explicit SQL default.

| Column                  | Meaning, writer/reader and null rule                                                                                                                                                             | Necessity and removal consequence                                                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `aggregateIndex`        | Required integer primary key. The projection producer retains the exact Aggregate position; the queue orders, bounds and acknowledges publication by it.                                         | Keep. It is neither a Node push position nor a command ID. Removing it loses ordered publication, contiguous receiving history and the exact deletion boundary.        |
| `dispositionChainHash`  | Required text freezing the disposition prefix at this position. Publication/history and exact snapshot checkpoint verification consume it.                                                       | Keep. The latest local head may already be newer than this pending row. It is a command/disposition-prefix hash, not a resource/delta digest.                          |
| `id`                    | Required canonical admitted command ID. The selected command retains it for authoritative command reconciliation and immutable duplicate equality.                                               | Keep. The Aggregate position and Node position are different facts; neither replaces the admitted command ID.                                                          |
| `commandName`           | Required public command name copied from the evaluated command. It is part of the projected command delivered to clients.                                                                        | Keep. Neither the owner nor canonical command ID supplies the command name. Removing it changes the confirmed-command protocol.                                        |
| `delta`                 | Required typed JSON selected graph transition, computed from the before/after selected graph in the resource transaction. Empty arrays are valid.                                                | Keep the frozen value. It is not the evaluated operation list or a current snapshot; later resources cannot reconstruct this earlier transition.                       |
| `failure`               | Nullable public refusal. Written only when this projection owns completion and the source outcome is Failure. Null also covers redacted/non-owning Failure, so it does not imply source Success. | Preserve the exact payload, but move it inside the optional private completion. An error tag alone cannot reconstruct its code, message, scope, status and extra data. |
| `completionNodeId`      | Nullable producing Node identity. Filled only for owned completion with a complete admitted producer tuple.                                                                                      | Preserve inside `completion.nodeId`; the actor partition does not identify the producing Node.                                                                         |
| `completionPushIndex`   | Nullable producing Node command-stream position. Used for contiguous private completion recovery.                                                                                                | Preserve inside `completion.pushIndex`; neither `aggregateIndex` nor `id` supplies it.                                                                                 |
| `completionSessionName` | Nullable exact admitted session definition. Used with Node and full Origin for private disclosure/recovery.                                                                                      | Preserve inside `completion.sessionName`; the actor owner can have multiple session definitions.                                                                       |
| `completionOrigin`      | Nullable full Origin. For this actor occurrence, every supported non-null value has the bound actor kind/name/version plus the original complete claims.                                         | Keep full claims inside `completion.claims`; derive `kind: 'actor'`, `actorName` and `actorVersion` from the bound owner. Repeating those fixed fields is unnecessary. |

The outbox copies `aggregateProjectedCommandsTable.shape`, **not its secondary indexes**. Its only declared key is `aggregateIndex`; the permanent-history canonical-ID and Node/push indexes are not pending-table indexes. Current queue reads/filtering/deletion use the Aggregate position, with no independent SQL query over private completion fields. No generated ID, timestamp, attempt counter, status or failure gate is added.

- [Shared ten-column shape and separate indexes](../../../packages/core/src/aggregateSession/aggregateExposedCommandsTable.ts#L11-L37), [shape-only reuse](../../../packages/system-worker/src/aggregateProjection/aggregateProjectionDbConfig.ts#L8-L11), [ordered/bounded pending reads and exact-index deletion](../../../packages/system-worker/src/makeOutboxQueue/makeOutboxQueue.ts#L192-L228).
- [Ownership, refusal and complete producer construction](../../../packages/system-worker/src/aggregateProjection/applyEvaluatedCommands/applyEvaluatedCommandsTx.ts#L69-L140), [frozen row encoding](../../../packages/system-worker/src/aggregateProjection/commitProjectionTx/commitProjectionTx.ts#L65-L84), [private replay ownership](../../../packages/system-worker/src/aggregateSessionChain/getBrowserCommands/getBrowserCommands.ts#L120-L130).

### Structured values and their purpose

1. `delta.upserted` contains full changed or newly selected resources: `id`, `modelName`, portable `version`, `createdAt`, `updatedAt` and authored encoded fields. `delta.deleted` contains `{ modelName, id }` for resources that left the selected graph. These are resource identities, versions and content, not duplicate command or projection-owner identity. Empty deltas still preserve command ordering and reconciliation.
2. `failure` contains `_tag: 'ZerospinError'`, `code`, optional `scope`, `message`, nullable `status` and JSON `extra`. These are the public encoded refusal; internal error/capture machinery is not stored here. Preserve every field in an owned failure.
3. `completionOrigin` uses the shared Actor/Agent/System codec, but this actor writer emits only Actor or null. A non-null Actor value contains `kind`, `actorName`, `actorVersion` and `claims`. The first three are fixed by this physical owner and checked again on append. Claims are `Record<string, unknown>` and must remain complete: `actorPath` captures only the declared identity fields, whereas private replay compares the full Origin structurally.

- [Delta shape](../../../packages/core/src/models/ActorDeltaSchema.ts#L8-L11), [encoded resource members](../../../packages/core/src/models/EncodedResourceSchema.ts#L5-L17), [selected before/after comparison](../../../packages/system-worker/src/aggregateProjection/commitProjectionTx/makeProjectionDelta.ts#L11-L29).
- [Public failure members](../../../packages/error/src/matchZerospinErrorCode.ts#L27-L36), [Origin variants and claims](../../../packages/core/src/contracts/OriginSchema.ts#L3-L16), [actor identity/path binding](../../../packages/system-worker/src/aggregateProjection/resolveActorIdentity/resolveActorIdentity.ts#L22-L65), [exact Origin disclosure comparison](../../../packages/system-worker/src/aggregateSessionChain/getBrowserCommands/getBrowserCommands.ts#L120-L130).

## Recommended six-column model

```ts
{
  aggregateIndex: number;
  dispositionChainHash: string;
  id: string;
  commandName: string;
  delta: typeof ActorDeltaSchema.Type;
  completion: null | {
    nodeId: string;
    pushIndex: number;
    sessionName: string;
    claims: Readonly<Record<string, unknown>>;
    failure: typeof PublicFailureSchema.Type | null;
  };
}
```

`completion === null` means this projection owns no private completion. A present object requires the complete Node/session/push tuple and full original claims. Its nullable `failure` distinguishes an owned successful completion from an owned refusal. The existing positive safe-integer rules for positions remain; no new discriminator or lifecycle flag is needed.

This grouping follows semantic ownership, not merely column count. The current producer fills all four recipient columns together, and a non-null failure belongs to that same owned completion. The receiving Chain already rejects mixed-null recipient tuples. Replacing only `completionOrigin` with `completionClaims` removes repeated identity but leaves five separately nullable pieces of one conditional fact. A single nullable object states the coupling directly and loses no pending-table query/index responsibility.

During publication preparation, reconstruct the complete Actor Origin locally:

```ts
{
  kind: 'actor',
  actorName: key.actorName,
  actorVersion: key.actorVersion,
  claims: completion.claims,
}
```

Expand to the existing complete Chain command: a null completion produces null failure and four null recipient fields; a present completion supplies its failure and producer tuple with that reconstructed Origin. This requires neither another RPC nor past-state reconstruction. Preserve the existing codec round trip and every original claim, including values outside the actor path; never substitute an empty or path-only claims record.

AggregateActorVersionChain's current wire input and physical history can remain unchanged. A later implementation must bind the actor-specific durable representation through the shared writer/publication code while preserving the separately unreviewed agent occurrence. Code sharing is not approval to change another owner's schema. No browser protocol redesign or truncated backend history follows from this recommendation.

- [Current coupled producer construction](../../../packages/system-worker/src/aggregateProjection/applyEvaluatedCommands/applyEvaluatedCommandsTx.ts#L79-L102), [private values supplied together](../../../packages/system-worker/src/aggregateProjection/applyEvaluatedCommands/applyEvaluatedCommandsTx.ts#L128-L156), [all-null/complete recipient validation and fixed owner identity](../../../packages/system-worker/src/aggregateSessionChain/appendExposedCommands.ts#L83-L113), [current decode/preparation and bound publication](../../../packages/system-worker/src/aggregateProjection/makeExposedCommandOutbox.ts#L45-L79).

## Commit, acknowledgement and recovery lifecycle

1. AggregateActorVersionRepo arms publication recovery before applying a delivered page. One synchronous page transaction applies model operations, computes each selected delta, inserts complete pending publications and advances the local materialization head. A later page failure rolls back all of that page. Refusals and no-op commands still retain individual positions.
2. The successful projection receipt allows AggregateVersionChain to advance source acknowledgement. It proves AggregateActorVersionRepo's local commit, not AggregateActorVersionChain publication. Selected publication proceeds independently through its own outbox/alarm.
3. The queue reads at most 64 rows in ascending `aggregateIndex`, optionally through a fixed snapshot boundary N. It decodes retained messages and sends them to AggregateActorVersionChain obtained from the exact bound projection key. It does not reevaluate contracts or recompute selected deltas from current resources.
4. AggregateActorVersionChain checks the complete source key, schema, contiguous new positions, producer coherence and exact repeated-message equality before its synchronous history append succeeds. A conflicting retry fails; an identical retry succeeds without duplicating history. Broadcast follows history commit; individual socket failure cannot undo retained publication.
5. Only a valid successful publication receipt permits local acknowledgement. The queue deletes the exact delivered indices in a transaction. Newer concurrently committed pending rows are not included. A lost reply, interruption, invalid receipt or failed deletion leaves complete rows for retry against immutable duplicate equality.
6. Producer activity/revision prevents an overlapping empty drain from releasing a newer producer's wake. Failed delivery retains recovery. Constructor-registered alarm operations recover retained pending rows after cold activation. No retry body reconstruction, stored suspension or manual resume is needed.
7. `getSnapshot` captures selected resources and local checkpoint N together, publishes through N, then verifies/retrieves the exact receiving-history checkpoint/private prefix through N. Pending-row deletion does not remove snapshot or recovery evidence from the materialization head and AggregateActorVersionChain history.

- [Actor receive/publication binding](../../../packages/system-worker/src/AggregateActorVersionRepo/AggregateActorVersionRepo.ts), [synchronous page transaction](../../../packages/system-worker/src/aggregateProjection/applyEvaluatedCommands/applyEvaluatedCommandsTx.ts#L103-L158), [transaction runner](../../../packages/core/src/drizzle/make/makeTx.ts#L69-L98), [producer recovery](../../../packages/system-worker/src/makeOutboxQueue/makeOutboxQueue.ts#L273-L295).
- [Source receipt ordering](../../../packages/system-worker/src/makeFanoutQueue/makeFanoutQueue.ts#L288-L301), [bound publication](../../../packages/system-worker/src/aggregateProjection/makeExposedCommandOutbox.ts#L65-L79), [immutable receiving append](../../../packages/system-worker/src/aggregateSessionChain/appendExposedCommands.ts#L28-L126), [commit before broadcast](../../../packages/system-worker/src/aggregateSessionChain/AggregateSessionChain.ts#L56-L109).
- [Valid receipt before acknowledgement](../../../packages/core/src/outbox/makeOutboxDelivery.ts#L286-L315), [exact-index acknowledgement transaction](../../../packages/system-worker/src/makeOutboxQueue/makeOutboxQueue.ts#L216-L228), [alarm registration](../../../packages/system-worker/src/makeOutboxQueue/makeOutboxQueue.ts#L335-L346), [exact captured snapshot boundary](../../../packages/system-worker/src/aggregateProjection/getSnapshot/getSnapshot.ts#L80-L116).

There is no TTL, diagnostic-retention or command-history deletion policy for this table. Its sole ordinary deletion condition is durable acknowledgement from the exact AggregateActorVersionChain. An AggregateVersionChain pointer is insufficient: it retains evaluated operations, not this frozen selection transition and projection-owned private completion. Recomputing from a newer resource graph changes the message; keeping acknowledged rows turns a resource Repo's delivery table into forbidden retained projected history.

## Reconciled finding and verification limits

The independent lifecycle and column-design reviewers agree: preserve every independent message fact and the current durable acknowledgement/recovery boundaries; recommend the six-column actor model above. The complete pending description consists of stored values plus the immutable bound owner. Its private completion is one optional fact, and fixed actor identity need not be copied into that fact.

This is a representation simplification, not a current data-loss repair. This turn changes only this finding and Plan 151. Current source, document links/ranges, formatting and whitespace were checked; no runtime/type/lint/test/build checks were rerun and no production code or storage changed. Existing blocked-publication/retry checks were inspected, not executed. Any later fixed-schema cutover requires empty affected storage, with no compatibility path or automatic reset. Additional AggregateVersionChain publication `dispositionChainHash` validation remains deferred.

**Next table:** AggregateActorVersionChain.projectedCommands. Agent and Service pending-publication occurrences remain individually unreviewed.
