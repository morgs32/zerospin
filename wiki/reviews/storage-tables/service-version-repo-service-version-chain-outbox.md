# ServiceVersionRepo.serviceVersionChainOutbox

## Current contract — full evaluated Service commands

[Plan 256](../../archive/plans/256-plan-service-evaluated-commands.md) supersedes the
selected-input representation examined below. `IEvaluatedServiceCommand` retains
the full admitted Service command: canonical `id`, `commandName`, encoded
`payload`, nullable `externalOutcome`, `contractVersion`, `serviceName`, original
`serviceVersion`, full `origin` and nullable producer tuple, plus `serviceIndex`,
`outcome: { result, finalizedAt }`, `dispositionChainHash` and ordered `operations`.
`serviceIndex` is the primary key and canonical `id` remains unique. The bound
VersionRepo/VersionChain identifies the evaluating release; replay preserves the
admitted `serviceVersion` even when it differs from that release.

ServiceVersionRepo atomically commits resources, `materializationHead` and this
complete pending command. The pending row remains unchanged until
ServiceVersionChain durably acknowledges the identical full command. Publication
failure or reply loss retains the row for retry. After acknowledged deletion,
ServiceVersionChain history recovers the exact original reply without evaluating
again. Publication acknowledgement, ServiceChain original-outcome retention and
projection acknowledgement remain separate durable facts.

- [Full command schema and physical shape](../../../packages/system-worker/src/ServiceVersionChain/evaluatedServiceCommand.ts).
- [Atomic pending retention](../../../packages/system-worker/src/ServiceVersionRepo/utils/retainEvaluatedCommandTx.ts).
- [Pending-first/history recovery](../../../packages/system-worker/src/ServiceVersionRepo/findEvaluatedCommand.ts).

This fixed-schema cutover requires empty affected ServiceVersionRepo and
ServiceVersionChain storage. No reset, translation, compatibility representation
or migration is authorized. Plan 256 records its verification separately from the
historical reports below.

## Historical review snapshot — superseded representation

The dated review, columns, verdicts and verification reports below describe the
representation before Plan 256. The prior conclusion that full admitted input was
unnecessary is superseded. Pre-cutover file references and line ranges are
historical evidence, not citations for the current declaration above.

**Reviewed:** 2026-10-16 against current uncommitted source, with independent column-design and lifecycle reviewers. Only this Service owner/table occurrence was reviewed. Implementation verification was deferred at that review; subsequent scoped results are recorded below.

**Verdict, amended by the maintainer: retain complete pending publication; twelve → ten columns implemented and scoped verification completed 2026-10-22.** Use one ordered `operations` union, derive four repeated embedded context fields from parent output/bound execution release, and remove `executionStartedAt`. Use one logical `outcome.finalizedAt` for ServiceVersionRepo resource writes, projection application and the retained outcome. Preserve authored sparse `operationIndex`, stable external command IDs, full authority and synchronous commits.

**Decision status:** Approved implementation and scoped verification are complete under archived [Plan 214](../../archive/plans/214-plan-service-ordered-operations-and-finalized-at.md), recorded 2026-10-22. Current shared Service output has ten columns and one compact union. ServiceVersionChain retains `commands`; ServiceChain has nullable `commands.outcome` and no `originalExecutions`. Complete output remains pending in ServiceVersionRepo until publication, then permanently in SVC commands. ServiceChain compares exact original outcomes; SVC compares full output. ADRs 015/016 are amended for this cutover. The old two-clock recommendation is superseded; it described machinery rather than a durable requirement.

**Review queue:** [Plan 151](../../plans/151-plan-storage-table-review.md). Plans 196/211/212/213 and the other Service amendments retain their separate work. Plan 214's scoped passing results do not close them or another table-purpose review. No existing-storage reset or deployment was performed.

## Implementation under Plan 214 — 2026-10-16

The current ten columns are `serviceIndex`, `commandId`, `commandName`, `origin`, `nodeId`, `sessionName`, `pushIndex`, `outcome`, `dispositionChainHash`, `operations`. The union retains authored sparse `operationIndex`, exact versions and stable external IDs while deriving the four repeated embedded context fields from parent output/bound release. At the Plan 214 implementation, ServiceChain reconstructed its then-eight-column standalone pending requests on first receipt. Subsequent Plan 219 removes pending parent/index lineage and leaves six complete invocation fields; that separate amendment retains its own verification status.

One transaction sample supplies ServiceVersionRepo source resource writes and retained `outcome.finalizedAt`; Service projections apply resource writes with that retained value. There is no `executionStartedAt` field or second finalization sample. Resources/head/publication remain one synchronous commit. ServiceVersionChain `commands` preserves full-output equality and hash validation; ServiceChain retains only exact original outcome and pending requests atomically, with direct point/finalized-prefix reads. Scoped Workerd checks now prove pending/remote original reply recovery, unchanged publication retry after commit-before-reply loss, acknowledgement-gated deletion, full immutable duplicate equality and invalid-batch rollback, finalized-prefix replay/restoration and atomic Actor/Agent projection with retained timestamps. See archived Plan 214 for the exact evidence and proof boundary.

The following audit preserves the original twelve-column source review and its historical lifecycle evidence. References to split arrays, old tables/joins and two samples describe that pre-cutover snapshot; they are not the current schema or verified implementation evidence.

## Physical owner and row responsibility

The physical ServiceVersionRepo key is `systemId / serviceName / serviceVersion`. Configuration resolves that exact authored Service release and composes its resource models with the fixed tables. One row is the complete committed output of one locally evaluated admitted command at `serviceIndex`, pending publication to the **same evaluating release's** ServiceVersionChain.

This is **complete pending delivery**, committed with resources and `materializationHead`, then deleted after successful receiver acknowledgement. It is not permanent execution history or runnable external work. ServiceChain separately retains admitted input and original output and alone invokes Service external requests. ServiceVersionChain retains immutable release-local output after this pending row disappears.

The bound owner supplies System, Service name and evaluating release; no repeated owner columns are required. Replay can evaluate an admitted command whose original `serviceVersion` differs from the receiving release. The publication's local outcome/hash belong to the bound evaluator. ServiceChain remains authoritative for admitted payload, contract version and original release; complete output recovery validates that association rather than reconstructing output from later resources.

- [Physical owner](../../../packages/system-worker/src/ServiceVersionRepo/serviceVersionRepoName.ts#L6-L14), [exact model/release binding](../../../packages/system-worker/src/ServiceVersionRepo/serviceVersionRepoMigratableDORepoConfig.ts#L24-L49), [pending declaration](../../../packages/system-worker/src/ServiceVersionRepo/serviceVersionRepoDbConfig.ts#L16-L19), [shared output shape](../../../packages/system-worker/src/ServiceVersionChain/serviceExecutionPacket.ts#L9-L47), [authoritative input association](../../../packages/system-worker/src/ServiceVersionRepo/validateCommandIdentity.ts#L35-L83).

## Original twelve-column audit and constraints

All fields are inserted together by `retainServiceResultTx` and remain immutable until acknowledgement deletes the row. Only `nodeId`, `sessionName` and `pushIndex` permit SQL null. No column has a SQL default. `serviceIndex` is the primary key; `commandId` has a unique constraint. There are no further declared indexes, SQL foreign keys, synthesized row IDs/timestamps, per-row leases, retry counts or delivery diagnostics.

| Column                 | Meaning and consumers                                                                                                                                                             | Disposition and removal consequence                                                                                                                                                                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `serviceIndex`         | Required local evaluation position in admitted Service order. Queue sorting, contiguous publication, result recovery and exact page deletion address it.                          | Retain. Owner identity does not identify a command position; a separate outbox sequence would duplicate ordering and obscure association.                                                                                                                             |
| `commandId`            | Required canonical admitted `id`, represented by the Service output field `commandId`. Unique across pending positions; validated as a `cmd_…` ID by the shared protocol.         | Retain the header and uniqueness. Position and command identity are distinct invariants. The queue queries by position; uniqueness rejects command-ID reuse across pending positions before committing resource/output state. Nested copies are separately removable. |
| `commandName`          | Required admitted command name. Recovery compares it with ServiceChain input; projection publication carries the public command name.                                             | Retain in complete output. Deriving it later adds a ServiceChain dependency to normal output/projection consumption. The containing release hosts multiple commands.                                                                                                  |
| `origin`               | Required full Actor/System authority, varying per admitted command. Used for association, retained output and exact private projection resolution.                                | Retain complete parent authority. It cannot derive from the Service owner or producer tuple; full Actor claims cannot be replaced by an actor path. Nested external Origin repeats it.                                                                                |
| `nodeId`               | Nullable original producer Node identity.                                                                                                                                         | Retain with the producer tuple. Null means no session producer; a present Node participates in private ownership/routing.                                                                                                                                             |
| `sessionName`          | Nullable original producer session identity.                                                                                                                                      | Retain. Node identity alone does not establish the original session's private resolution ownership.                                                                                                                                                                   |
| `pushIndex`            | Nullable original producer sequence position, positive when present.                                                                                                              | Retain. It supports exact command association and contiguous private completion; it is independent of `serviceIndex`.                                                                                                                                                 |
| `outcome`              | Required `{ result, finalizedAt }` for this release's evaluation. Retained original replies recover its exact value; projections consume the public Failure when privately owned. | Retain complete result/refusal and finalization time. A Success/Failure tag or matching hash cannot reconstruct them.                                                                                                                                                 |
| `executionStartedAt`   | Current resource-application sample taken before evaluation. Source/projection writes currently consume it, while finalization currently samples another value.                   | Remove under Plan 214. Sample one logical `finalizedAt` in materialization and use it for source writes, retained outcome and projection application. The old two-sample implementation is not a durable domain requirement.                                          |
| `dispositionChainHash` | Required local ordered-disposition prefix hash. ServiceVersionChain and projections validate it against their predecessor.                                                        | Retain. It identifies the ordered command-ID/Success-Failure prefix; it does not replace result or operation bodies.                                                                                                                                                  |
| `operations`           | Required typed JSON array of encoded forward model mutations, possibly empty.                                                                                                     | Preserve model output in the proposed single ordered union. Later resource state cannot recover historical mutations or their authored order.                                                                                                                         |
| `externalOperations`   | Required typed JSON array of original-only frozen external descriptions, possibly empty.                                                                                          | Remove the separate column in the proposed model; preserve complete external members in `operations`. No independent delivery lifecycle justifies partitioning the stored output.                                                                                     |

Producer fields are coupled: a valid admitted command has all three null, or all three present with Actor Origin, nonempty Node/session and a positive push index. Actor Origin can legitimately have an all-null tuple, including an admitted external observation. The SQL shape itself allows independent nulls; admitted/final-command validation establishes valid producer values, ServiceVersionChain rejects partial tuples, and projection validation requires Actor authority for a present producer. Removing producer fields or inferring their presence solely from Actor Origin would change privacy behavior.

- [All twelve columns and protocol constraints](../../../packages/system-worker/src/ServiceVersionChain/serviceExecutionPacket.ts#L10-L47), [single writer](../../../packages/system-worker/src/ServiceVersionRepo/utils/retainServiceResultTx.ts#L22-L59), [header association](../../../packages/system-worker/src/ServiceVersionRepo/validateCommandIdentity.ts#L18-L52), [receiver producer coupling](../../../packages/system-worker/src/ServiceVersionChain/appendExecutionPacketsTx.ts#L81-L94), [projection identity/privacy](../../../packages/system-worker/src/serviceProjection/prepareServiceProjectionOccurrence.ts#L38-L51), [private resolution ownership](../../../packages/system-worker/src/serviceProjection/applyExecutionPacketsTx.ts#L59-L76).

## Every structured value

### Origin and outcome

Service Origin is either Actor `{ kind: 'actor', actorName, actorVersion, claims }` or System `{ kind: 'system' }`. Actor name/version are required nonempty strings; `claims` retains the complete application-defined record, with no fixed claim keys. There is no Agent variant, nullable authority or placeholder claims field for System.

`outcome` has required `result` and outer `finalizedAt`. Success is `{ _tag: 'Success', success: JSON }`; Failure is `{ _tag: 'Failure', failure }`. A public failure retains `_tag: 'ZerospinError'`, required `code`/`message`, optional `scope` (`contract`, `actor` or `aggregate`), nullable numeric `status` and JSON `extra`. Authored JSON null is legitimate Success/extra data, not a missing SQL outcome. The finalization timestamp belongs outside both branches.

- [Service Origin variants](../../../packages/core/src/contracts/ServiceCommandOriginSchema.ts#L5-L8), [full Actor/System fields](../../../packages/core/src/contracts/OriginSchema.ts#L3-L16), [outcome shape](../../../packages/core/src/contracts/CommandOutcomeSchema.ts#L5-L16), [all public failure fields](../../../packages/error/src/matchZerospinErrorCode.ts#L27-L36).

### Model mutations in current operations

Every model member has required `commandId`, `operationIndex`, `modelName`, `modelVersion`, `resourceId`, mutation `operationName` and string `body`.

1. `commandId` repeats parent `commandId`; derive it when expanding a standalone operation in the proposed representation.
2. `operationIndex` is the original safe nonnegative authored position. Retain it: replay removes external emissions, leaving meaningful gaps. Array offset is not a substitute.
3. `modelName` identifies which release-owned model is mutated; `resourceId` identifies its resource. Both vary per command and cannot derive from its name or owner.
4. Exact `modelVersion` is derivable from the bound model map, but is retained as part of the existing portable mutation identity and codec check. This review proposes no change to that canonical model-version contract.
5. `operationName` selects `create`, `update`, `delete` or `move`; it is necessary to interpret/apply the body.
6. `body` is a JSON string decoded through the exact model's operation codec: create contains complete portable `attributes`; update contains portable patch `attributes`; delete is `{}`; move contains `property`, `prevId` and `nextId`. Move values are strings, safe integers or null as permitted by the authored cursor/reference property. Attributes remain model-defined. These are frozen mutation inputs, not a later resource lookup.

There is no per-operation `appliedAt`, `previousUpdatedAt` or inverse operation in this table. Projections obtain `appliedAt` from parent `executionStartedAt`.

- [Complete model envelope](../../../packages/core/src/contracts/encodeAppliedOperation.ts#L12-L20), [canonical encoding](../../../packages/core/src/contracts/encodeAppliedOperation.ts#L30-L64), [safe positions/body variants](../../../packages/core/src/contracts/operationCodecs.ts#L38-L91), [exact model/version and parent checks](../../../packages/system-worker/src/ServiceVersionChain/appendExecutionPacketsTx.ts#L123-L162), [projection application time](../../../packages/system-worker/src/serviceProjection/prepareServiceProjectionOccurrence.ts#L59-L81).

### Frozen external descriptions in current externalOperations

Every external member has required `initiatingCommandId`, `operationIndex`, `externalContractName`, `externalContractVersion`, `payload`, `externalCommandId`, `origin` and `serviceVersion`.

1. `initiatingCommandId` repeats parent `commandId`; `origin` repeats parent full authority. Recommend deriving both within embedded output.
2. `serviceVersion` is the emitting/evaluating release. Recommend deriving it from the exact bound execution owner. The admitted original release can differ on replay; do not substitute it as a general execution-owner rule. Actual external members exist only for original evaluation, where those versions coincide.
3. `operationIndex` retains the original authored emission position and must survive union normalization and replay gaps.
4. Exact external contract name/version identify the frozen declaration. Retain them; a parent command can emit multiple external contracts, and later/latest declaration resolution cannot replace frozen identity.
5. `payload` is frozen encoded JSON, including valid JSON null. The external contract owns its shape; no framework provider-address/retry keys are prescribed. Resource or parent input cannot generally reconstruct it.
6. `externalCommandId` is a stable allocated `cmd_…` ID retained through reply recovery and used as the external admitted command's canonical `id`. Retain it exactly; recovering a reply must not allocate another ID. It is not automatically a provider idempotency key.

These descriptions contain no external observation, response, status, lease, attempt counter or per-request error. Retaining them in publication/history never schedules their requests. Replay omits external emissions before preparation/ID allocation. ServiceChain's separately owned pending request must remain complete when reconstructed from compact embedded output.

- [All external fields](../../../packages/system-worker/src/externalOperations/externalOperation.ts#L8-L35), [freezing and ID allocation](../../../packages/system-worker/src/externalOperations/prepareExternalOperation.ts#L28-L67), [exact Service emission release](../../../packages/system-worker/src/externalOperations/prepareExternalOperation.ts#L104-L132), [original-only preparation and sparse positions](../../../packages/system-worker/src/ServiceVersionRepo/utils/prepareServiceOutput.ts#L23-L42), [current original receipt reconstruction boundary](../../../packages/system-worker/src/ServiceChain/acknowledgeCommand.ts#L90-L120).

## Commit, publication, deletion and recovery

1. Original execution and replay both produce this release-local pending output. `materializeCommandTx` validates contiguous progress, evaluates/applies model mutations inside the business savepoint, finalizes local outcome/hash, and inserts complete publication plus the head in one synchronous outer transaction. A supported public refusal rolls back the savepoint and retains Failure with both arrays empty. A no-operation Success may also have empty arrays. Infrastructure failure rolls back resources/head/publication together.
2. Original handling and replay reception acquire `serviceVersionChainOutbox.producerLease` before producer work and explicitly run `serviceVersionChainOutbox.wake()` on every producer exit. Activation directly runs local catch-up and explicitly wakes publication on exit, including when no new rows are produced. The finalizers preserve the original result or Cause, including failures after earlier publication commits. Activation does not await outgoing publication.
3. The queue reads ascending `serviceIndex` pages, default size 64. It decodes the complete table row/shared protocol, acquires ServiceVersionChain using the exact bound Repo key and sends the complete output. There is no independent model/external cursor or subscriber for this publication.
4. ServiceVersionChain appends in one synchronous transaction. It accepts a repeated row only on full equality, rejects partial producer tuples and operations on Failure, validates model and external associations/positions, requires contiguous history and checks the hash. It retains complete execution history and projection fanout before returning successful acknowledgement. External descriptions remain data.
5. Only after a successful RPC envelope does the Repo queue delete exactly the delivered page's positions in a local transaction. Preparation, transport, receiver or deletion failure leaves pending work recoverable. A lost receiver reply or failed local deletion causes exact redelivery against immutable history. Queue alarms and producer revisions protect pending work across interruption and concurrent production; no persisted delivery-status column is needed.
6. A duplicate original first checks local materialization progress before predecessor replay or fresh declaration lookup. It recovers the exact pending output, otherwise permanent ServiceVersionChain output after deletion. Authoritative admitted-input association is checked outside SQL/execution permits. Missing/conflicting/unavailable history fails recovery; it never permits reevaluation, timestamp resampling or new external ID allocation.
7. ServiceChain separately retains its original output and pending external requests after its original receiving RPC succeeds. This outbox's deletion proves ServiceVersionChain publication; it does not prove ServiceChain original-output retention, external request invocation, external observation admission or continuation outcome retention. Neither publication deletion nor later fanout acknowledgement deletes permanent execution history or the resource head.

- [Atomic materialization](../../../packages/system-worker/src/ServiceVersionRepo/materializeCommandTx.ts#L28-L44), [savepoint and failure classification](../../../packages/system-worker/src/ServiceVersionRepo/utils/executeServiceOccurrence.ts#L36-L126), [publication/head insertion](../../../packages/system-worker/src/ServiceVersionRepo/utils/retainServiceResultTx.ts#L22-L59).
- [Activation/original queue binding](../../../packages/system-worker/src/ServiceVersionRepo/ServiceVersionRepo.ts#L84-L167), [replay producer binding](../../../packages/system-worker/src/ServiceVersionRepo/ServiceVersionRepo.ts#L193-L217), [recovery before producer](../../../packages/system-worker/src/makeOutboxQueue/makeOutboxQueue.ts#L285-L340), [ascending pages and exact deletion](../../../packages/system-worker/src/makeOutboxQueue/makeOutboxQueue.ts#L188-L233), [producer-aware alarm release](../../../packages/system-worker/src/makeOutboxQueue/makeOutboxQueue.ts#L342-L356).
- [Successful envelope before acknowledgement](../../../packages/core/src/outbox/makeOutboxDelivery.ts#L286-L314), [same-release receiver and append](../../../packages/system-worker/src/ServiceVersionChain/ServiceVersionChain.ts#L187-L210), [whole-row duplicate/operation/hash checks](../../../packages/system-worker/src/ServiceVersionChain/appendExecutionPacketsTx.ts#L65-L184).
- [Duplicate original ordering](../../../packages/system-worker/src/ServiceVersionRepo/executeCommand/executeCommand.ts#L51-L106), [pending-to-history result recovery](../../../packages/system-worker/src/ServiceVersionRepo/readCommandResult.ts#L27-L68), [authoritative association](../../../packages/system-worker/src/ServiceVersionRepo/validateCommandIdentity.ts#L35-L83), [separate original retention and pending-request commit](../../../packages/system-worker/src/ServiceChain/acknowledgeCommand.ts#L31-L121).

## Planned shared Service representation — Plan 214

Retain current header fields except `executionStartedAt`, and use one non-null ordered `operations` union. The planned ten columns are `serviceIndex`, `commandId`, `commandName`, `origin`, `nodeId`, `sessionName`, `pushIndex`, `outcome`, `dispositionChainHash`, `operations`:

```ts
// Model member
{
  (operationIndex, modelName, modelVersion, resourceId, operationName, body);
}

// External member
{
  operationName: ('external',
    operationIndex,
    externalContractName,
    externalContractVersion,
    payload,
    externalCommandId);
}
```

Derive the four repeated context fields from parent `commandId`/`origin` and the bound execution release when a consumer needs complete standalone operations. Preserve ServiceChain's complete existing pending external row at its original receipt boundary. Union indexes must be strictly increasing; model consumers select mutations and original ServiceChain receipt selects external descriptions. Do not renumber replay indexes.

The union removes cross-array position collision bookkeeping; removing the separate execution timestamp makes the planned representation ten columns. Current arrays already preserve interleaving through their indexes, so this is a clearer data model, not a claim of lost order or incorrect delivery. A marker/pointer cannot replace the complete pending result: output must survive resource changes and be recoverable before history publication, without another remote reconstruction/reevaluation path.

The shared Service schema also represents ServiceVersionChain history/fanout, original reply recovery/ServiceChain retained output and projection input. Plan 214 implements coordinated consumer changes and ADR 015/016 amendments, requires empty affected fixed storage and has completed scoped verification under archived Plan 214. It is not an outbox-only declaration edit or approval of another table's lifecycle. The plan keeps existing Service admitted-input ownership and names while explicitly unifying the evaluation/resource timestamp.

### One logical Service outcome.finalizedAt

The original audit correctly observed two current samples but incorrectly treated their separation as a requirement. The maintainer settled the replacement: ServiceVersionRepo samples one logical `finalizedAt` inside its synchronous materialization transaction after authority/progress validation, uses it for source resource application and retained `outcome`, and Service projections use that retained `outcome.finalizedAt`. A supported public refusal retains the same logical sample after savepoint rollback. Duplicates recover the exact stored value; infrastructure rollback retains no outcome.

Remove physical `executionStartedAt`, its old transaction `startedAt` carrier, second finalization sample and parameter/serialization/projection plumbing. The independent `externalOutcome.recordedAt` observation and speculative client staging clocks keep their own meanings. Plan 214 records the ten-column shared representation, retained SVC `commands` and ServiceChain nullable `commands.outcome` with removed `originalExecutions`; the implementation and bounded verification are complete under archived Plan 214.

The hash includes the prior hash, `serviceIndex`, canonical admitted command ID and only `outcome.result._tag`. It includes neither timestamp, full result nor operation bodies. Matching hash is insufficient for duplicate equality; full output must remain available.

- [Before-evaluation sample](../../../packages/system-worker/src/ServiceVersionRepo/utils/readServiceOccurrenceTx.ts#L69), [source resource application](../../../packages/system-worker/src/ServiceVersionRepo/utils/applyServiceOutputTx.ts#L22-L45), [later finalization and hash](../../../packages/system-worker/src/ServiceVersionRepo/utils/finalizeServiceOccurrence.ts#L19-L37), [projection timestamp](../../../packages/system-worker/src/serviceProjection/prepareServiceProjectionOccurrence.ts#L73-L81), [shared tag-only preimage](../../../packages/core/src/contracts/dispositionChainHash.ts#L5-L17).

## Reconciled finding and verification limits

Both independent reviewers support complete pending publication and the ordered-union simplification. The column audit additionally supports removing four repeated embedded context fields while retaining exact model versions, stable external IDs, full parent authority and complete standalone pending requests. They found no ordinary-path lifecycle/privacy defect. The maintainer subsequently settled the ten-column design, including removing the second clock, in Plan 214. Implementation and ADR amendments are complete; bounded verification completed on 2026-10-22 under archived Plan 214.

The original review changed only this finding and Plan 151. Planning and implementation subsequently recorded the maintainer correction and changed coordinated schemas/consumers, existing checks and documentation under Plan 214; those phases deferred verification. That historical evidence is preserved above.

On 2026-10-22 the existing test target passes 46 tests across eight files, including 21 Workerd cases and the separate Clock case. Real original receivers recover the same packet from pending publication and remote ServiceVersionChain history. Pre-commit failure and post-commit reply loss retain pending publication; identical retry succeeds and only then deletes the delivered page. ServiceVersionChain owns whole-output duplicate equality, including timestamp and operation body, and rejects invalid batches atomically. ServiceChain compares only its retained original outcome; equal-outcome repeated receipts do not recreate deleted requests. Cold replay reads the finalized source prefix and restores existing-release output without evaluation; fresh parallel replay suppresses external output while preserving sparse model indexes. Actor/Agent projection resources, checkpoint and pending selected publication commit atomically at the retained timestamp.

Publication acknowledgement is void success after ServiceVersionChain commits or recognizes identical output; it is distinct from command admission, ServiceChain original-outcome retention, selected Chain delivery and eventual execution. The proof does not exercise real provider/continuation delivery, selected Chain delivery, private authentication, browser behavior or automatic activation. Existing storage was not reset and no compatibility path or deployment was introduced. Plans 196/211/212/213 and other Service amendments retain their own obligations. Additional AggregateVersionChain publication hash validation remains separately deferred; ServiceVersionChain validates its published hash.

**Original next-table queue:** ServiceVersionChain.commands, the retained-history occurrence renamed from `executionHistory` under Plan 214. Its separate table-purpose review status is tracked by Plan 151; this implementation verification does not complete another owner/table review.
