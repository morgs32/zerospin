# ServiceVersionChain.commands

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

ServiceVersionChain `commands` permanently retains this exact value. Its
`appendEvaluatedCommands` method validates complete immutable input/output and
contiguous release-local history before durable acknowledgement; exact duplicates
preserve history and contradictory input or output fails. Actor and Agent fanout
read these commands directly and advance only their own subscriber cursors.
Projection applies model operations using parent `id` and `outcome.finalizedAt`;
its selected browser publication remains explicit.

- [Full command schema and physical shape](../../../packages/system-worker/src/ServiceVersionChain/evaluatedServiceCommand.ts).
- [Immutable append transaction](../../../packages/system-worker/src/ServiceVersionChain/appendEvaluatedCommandsTx.ts).
- [History and subscriber ownership](../../../packages/system-worker/src/ServiceVersionChain/serviceVersionChainDbConfig.ts).

This fixed-schema cutover requires empty affected ServiceVersionRepo and
ServiceVersionChain storage. No reset, translation, compatibility representation
or migration is authorized. Plan 256 records its verification separately from the
historical reports below.

## Historical review snapshot — superseded representation

The dated review, columns, verdicts and verification reports below describe the
representation before Plan 256. The prior conclusion that full admitted input was
unnecessary is superseded. Pre-cutover file references and line ranges are
historical evidence, not citations for the current declaration above.

**Reviewed:** 2026-10-16 against current uncommitted source, with independent column-design and lifecycle reviewers. Only this physical table was reviewed. All verification remains deferred at the maintainer's request.

**Verdict: retain all ten columns, current names and permanent immutable retention.** This row preserves complete release-local evaluation output after ServiceVersionRepo deletes acknowledged pending publication. It supplies exact result recovery, immutable duplicate comparison, disposition checkpoints and projection catch-up. No further column removal, rename or ordinary-path lifecycle repair is justified.

**Review queue:** [Plan 151](../../plans/151-plan-storage-table-review.md). **Architecture:** [ADR 015](../../adrs/015-service-delivery-history-and-projection-ownership.md) and the applicable Service amendment in [ADR 016](../../adrs/016-aggregate-original-operations-and-external-work.md). [Plan 214](../../archive/plans/214-plan-service-ordered-operations-and-finalized-at.md) has implemented the shared ten-column ordered output, one logical `outcome.finalizedAt`, retained `commands` naming and ServiceChain outcome-only retention. Those approved decisions are the source baseline; Plan 214 completed its bounded Workerd recovery/publication/projection verification on 2026-10-22. The dated table-purpose review below remains separate source evidence.

**Subsequent implementation:** [Plan 215](../../archive/plans/215-plan-service-commands-backed-actor-fanout.md) removes the separate physical actor fanout copy and its shared maintenance hooks. Complete `commands` and their immutable retention remain unchanged; the logical queue now reads them directly and acknowledgements advance only subscriber cursors. The historical append/backfill descriptions below refer to the preceding payload-copy snapshot. Plan 215 completed its bounded fanout/enrollment verification on 2026-10-22; this note does not repeat the commands table review.

## Physical owner and represented fact

One ServiceVersionChain database belongs to exact `{ systemId, serviceName, serviceVersion }`. These identities are bound by the physical owner and need no repeated row columns. ServiceVersionChain owns no materialized Service resource tables; ServiceVersionRepo owns the separate materialized view and its checkpoint/pending publication.

One row means this exact Service release's complete evaluation output for the admitted command at `serviceIndex` has been durably published. It is **immutable history**, not an admitted-input record, materialization head, outstanding external request or projection acknowledgement. Original evaluation and replay both publish release-local output. A receiving release can derive a different disposition when replaying the same admitted command.

ServiceChain remains authoritative for admitted payload, exact command contract version and original-release routing. This row deliberately stores selected complete output rather than Aggregate's full admitted `IEvaluatedCommand`. No additional input columns or Service representation rename are required by this finding.

- [Physical owner](../../../packages/system-worker/src/ServiceVersionChain/serviceVersionChainName.ts#L5-L8), [table declaration](../../../packages/system-worker/src/ServiceVersionChain/serviceVersionChainDbConfig.ts#L6-L24), [exact bound release at append](../../../packages/system-worker/src/ServiceVersionChain/ServiceVersionChain.ts#L187-L210), [authoritative input association](../../../packages/system-worker/src/ServiceVersionRepo/validateCommandIdentity.ts#L35-L83).

## Every column, constraint and consumer

The shared physical shape declares ten columns. `serviceIndex` is the integer primary key; `commandId` is required text with a unique constraint. Only `nodeId`, `sessionName` and `pushIndex` are nullable. There are no SQL defaults, additional declared indexes, foreign keys or framework-added declared IDs/timestamps. Wire decoding establishes positive integer positions, canonical command IDs and the hash format; the SQL declaration alone does not establish those constraints or producer coupling.

`appendExecutionPacketsTx` is the sole insertion writer. No supported update or deletion mutates retained commands. Its complete decoded row feeds point-result reads, checkpoint reads and ordered catch-up; projections and duplicate recovery consume that retained output.

| Column                 | Meaning and actual consumers                                                                                                                                                                                                | Necessity and removal consequence                                                                                                                                                                                                                                                  |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `serviceIndex`         | This release's ordered admitted-command position. Used by append continuity, history tip, bounded ascending pages, exact result/checkpoint lookup, projection progress and hash construction.                               | Retain. It distinguishes placement/progress from identity and private producer sequence. Removing it loses contiguous history and bounded recovery.                                                                                                                                |
| `commandId`            | Canonical admitted command ID, unique within this history. Recovery associates it with authoritative ServiceChain input; projections derive mutation attribution from it; the hash incorporates it.                         | Retain. Neither command name nor operation content identifies the admitted command. Unique identity prevents one command appearing at multiple positions.                                                                                                                          |
| `commandName`          | Public command name retained with the output. Recovery checks it against authoritative admitted input, and projections carry it into selected output.                                                                       | Retain. It varies within this owner and cannot derive from the ID or operations locally. Removing it would require remote input hydration to recover the complete output/selected command.                                                                                         |
| `origin`               | Complete immutable Actor/System authority. Recovery checks the full value; projection resolution ownership compares Actor identity and every retained claim.                                                                | Retain full authority. Owner identity and producer fields cannot reconstruct it; replacing claims with an actor path changes private resolution ownership.                                                                                                                         |
| `nodeId`               | Nullable original producer Node identity, consumed by exact input association and private resolution.                                                                                                                       | Retain. Actor identity does not establish which Node produced the admitted command. Null participates in the coupled absence of a session producer.                                                                                                                                |
| `sessionName`          | Nullable original producer session identity, consumed with Node/push position by recovery and private resolution.                                                                                                           | Retain. It varies independently within Actor/Node identity; Node alone does not identify the originating session.                                                                                                                                                                  |
| `pushIndex`            | Nullable original producer sequence position, positive when present. Recovery and private resolution preserve the exact originating command position.                                                                       | Retain. Global `serviceIndex` cannot replace a producer's sequence position. Null means the producer tuple is absent.                                                                                                                                                              |
| `outcome`              | Required `{ result: Success \| Failure, finalizedAt }` for this release's evaluation. Exact recovery returns it; projection application uses its logical timestamp, and privately owned failures retain the public refusal. | Retain complete result and time. A disposition tag/hash cannot reconstruct Success data, public Failure or the exact original reply.                                                                                                                                               |
| `dispositionChainHash` | Prefix hash for this release's ordered command identities/dispositions. Append compares the next supplied prefix; checkpoint and projection consumers use the retained value.                                               | Retain. It is recomputable from the complete prefix, but removing it turns exact checkpoint reads into prefix scans and removes the stored predecessor used by append. It is not a checksum of complete output.                                                                    |
| `operations`           | Required JSON array of one ordered model/external union, possibly empty. Append checks it; projections apply model members; complete result recovery preserves all original external descriptions and stable IDs.           | Retain complete immutable output. Current resource rows and ServiceChain's outcome-only retention cannot reconstruct historical mutations or original external descriptions. Removing external members after request admission would also break exact duplicate equality/recovery. |

- [Protocol and all ten physical fields](../../../packages/system-worker/src/ServiceVersionChain/serviceExecutionPacket.ts#L25-L56), [shape composition without added columns](../../../packages/shapes/src/makeTable.ts#L76-L106), [sole insertion/duplicate checks](../../../packages/system-worker/src/ServiceVersionChain/appendExecutionPacketsTx.ts#L65-L79), [history insertion](../../../packages/system-worker/src/ServiceVersionChain/appendExecutionPacketsTx.ts#L151-L171).
- [Tip and ordered pages](../../../packages/system-worker/src/ServiceVersionChain/ServiceVersionChain.ts#L47-L53), [page decoding](../../../packages/system-worker/src/ServiceVersionChain/ServiceVersionChain.ts#L161-L184), [point results and checkpoints](../../../packages/system-worker/src/ServiceVersionChain/ServiceVersionChain.ts#L214-L289), [input association](../../../packages/system-worker/src/ServiceVersionRepo/validateCommandIdentity.ts#L35-L83), [private resolution and selected output](../../../packages/system-worker/src/serviceProjection/applyExecutionPacketsTx.ts#L59-L137).

### Producer coupling and privacy

Valid admitted input has all three producer fields null, or all present with Actor Origin, nonempty Node/session strings and a positive push index. Actor Origin can legitimately have an absent producer tuple, including an external observation. Actor Origin alone must not imply a private producer resolution.

Append independently rejects partial tuples. Projection validation additionally requires Actor authority and nonempty producer strings when the tuple is present. The authoritative admitted-command schema already enforces those stronger rules for producer commands; supported evaluation/recovery paths validate identity. This difference in validation placement does not establish a reachable ordinary-path defect.

Projection input is bound to exact Service owner/release. Private resolution additionally requires matching actor name/version and every encoded identity claim. Raw complete output is not a browser frame: projections publish selected model output and only the originating actor's eligible private resolution. External descriptions are skipped during model application.

- [Admitted producer command](../../../packages/core/src/contracts/CommandSchema.ts#L85-L98), [append tuple completeness](../../../packages/system-worker/src/ServiceVersionChain/appendExecutionPacketsTx.ts#L81-L94), [projection release/producer boundary](../../../packages/system-worker/src/serviceProjection/prepareServiceProjectionOccurrence.ts#L31-L57), [private ownership](../../../packages/system-worker/src/serviceProjection/applyExecutionPacketsTx.ts#L59-L76), [subscriber owner binding](../../../packages/system-worker/src/serviceProjection/executionPacketsFanoutSubscriber.ts#L41-L50).

## Every structured value

### Origin and outcome

Service Origin is Actor `{ kind: 'actor', actorName, actorVersion, claims }` or System `{ kind: 'system' }`. Actor name/version are required nonempty strings; `claims` is the complete application-defined record, with no fixed claim keys. There is no Agent variant or placeholder System credential.

`outcome` has required `result` and outer `finalizedAt`. Success is `{ _tag: 'Success', success: JSON }`; Failure is `{ _tag: 'Failure', failure }`. The public Failure contains `_tag: 'ZerospinError'`, required `code`/`message`, optional `scope` (`contract`, `actor` or `aggregate`), nullable numeric `status` and JSON `extra`. JSON null can be authored Success/extra data; it does not mean an absent SQL outcome.

`outcome.finalizedAt` is the one logical evaluation sample used by source resource application, retained outcome and projection application. It sits outside both result branches. Duplicate recovery preserves the exact retained value; there is no `executionStartedAt` or per-operation application timestamp here.

- [Service Origin](../../../packages/core/src/contracts/ServiceCommandOriginSchema.ts#L3-L8), [Actor/System fields](../../../packages/core/src/contracts/OriginSchema.ts#L3-L16), [outcome shape](../../../packages/core/src/contracts/CommandOutcomeSchema.ts#L5-L16), [public Failure](../../../packages/error/src/matchZerospinErrorCode.ts#L27-L36), [projection time from parent outcome](../../../packages/system-worker/src/serviceProjection/prepareServiceProjectionOccurrence.ts#L71-L79).

### Ordered model/external operations

Every member retains a safe nonnegative `operationIndex`. Append requires strictly increasing positions across the mixed union. Preserve sparse values: authored slots are enumerated before replay omits external emissions, so array offsets cannot replace these positions. Failure requires an empty array; Success can legitimately contain no operations.

Each model member has six required fields:

1. `operationIndex`: original authored position.
2. `modelName`: release-owned model declaration to mutate.
3. `modelVersion`: exact portable model version, checked against that declaration. The bound release can resolve it, but retaining it preserves the canonical portable operation identity and exact codec association.
4. `resourceId`: affected resource identity within that model.
5. `operationName`: `create`, `update`, `delete` or `move`, selecting body interpretation.
6. `body`: encoded JSON string. Create contains full portable `attributes`; update contains portable patch `attributes`; delete contains `{}`; move contains `property`, `prevId` and `nextId`, validated against the authored reference/cursor property. Non-null endpoints are strings or safe integers; null represents an endpoint. Attribute fields remain model-defined.

Parent `commandId` is restored when a consumer needs a standalone model operation. There is no nested command ID, inverse body, `appliedAt` or `previousUpdatedAt`. Operation kind/body and resource identity cannot be reconstructed from later resource state.

Each external member also has six required fields: `operationName: 'external'`, `operationIndex`, `externalContractName`, `externalContractVersion`, frozen portable JSON `payload` and stable canonical `externalCommandId`. Exact contract name/version select the authored declaration. JSON null is a valid payload. The stable ID becomes the external admitted command's canonical `id`; recovering the original output must not allocate another ID. It is not automatically a provider idempotency key.

Parent `commandId`/full `origin` and the bound evaluating `serviceVersion` supply the removed repeated external context when ServiceChain constructs a complete pending request. Replay excludes external emissions before preparation/ID allocation; original-only external descriptions remain immutable history afterward. They contain no observation, response, status, attempt counter or scheduling state. ServiceVersionChain does not invoke their external contracts.

- [Compact union](../../../packages/system-worker/src/ServiceVersionChain/serviceExecutionPacket.ts#L9-L20), [portable model envelope](../../../packages/core/src/contracts/encodeAppliedOperation.ts#L12-L20), [positions and body variants](../../../packages/core/src/contracts/operationCodecs.ts#L38-L91), [move validation](../../../packages/core/src/contracts/operationCodecs.ts#L239-L261).
- [External schema](../../../packages/system-worker/src/externalOperations/externalOperation.ts#L8-L32), [sparse original/replay preparation](../../../packages/system-worker/src/ServiceVersionRepo/utils/prepareServiceOutput.ts#L25-L41), [mixed order/external identity/model codecs](../../../packages/system-worker/src/ServiceVersionChain/appendExecutionPacketsTx.ts#L95-L149), [projection filters and parent context](../../../packages/system-worker/src/serviceProjection/prepareServiceProjectionOccurrence.ts#L59-L79), [complete pending request reconstruction](../../../packages/system-worker/src/ServiceChain/recordOriginalCommandOutcomeTx.ts#L61-L112).

### Disposition prefix versus immutable equality

The hash extends SHA-256 over `[previousHash, serviceIndex, commandId, outcome.result._tag]`. Service genesis is SHA-256 of `zerospin.service.disposition.v1`. It excludes Success/Failure contents, timestamps, Origin, model bodies and external descriptions. Matching hashes do not prove equal output.

Append therefore compares the entire existing row for an already retained position. A changed result, timestamp, authority or operation body fails equality even if the hash matches. New rows require the next contiguous position and recomputed prefix hash. ServiceVersionChain already performs this validation; AggregateVersionChain's separately deferred additional hash validation is not a missing Service check.

- [Service genesis/hash](../../../packages/system-worker/src/serviceDispositionChainHash/serviceDispositionChainHash.ts#L5-L43), [shared tag-only preimage](../../../packages/core/src/contracts/dispositionChainHash.ts#L5-L17), [whole-output duplicate equality](../../../packages/system-worker/src/ServiceVersionChain/appendExecutionPacketsTx.ts#L65-L79), [next-position/hash checks](../../../packages/system-worker/src/ServiceVersionChain/appendExecutionPacketsTx.ts#L151-L158).

## Commit, acknowledgement, recovery and permanent retention

1. ServiceVersionRepo synchronously commits resources, local materialization progress and complete pending publication before delivery. Publication to ServiceVersionChain is separate from ServiceChain retaining the original outcome and from any external invocation or projection commit.
2. `ServiceVersionChain.appendExecutionPackets` acquires the fanout producer lease before its synchronous append transaction. Append strictly decodes complete output, validates immutable duplicates, producer coupling, Failure emptiness, mixed operation positions, external IDs/declarations, exact model bodies, contiguous positions and the disposition prefix.
3. Each new command and its current complete pending actor fanout row are inserted atomically. An invalid later row rolls back new history/fanout writes in that append page. Exact duplicates return without creating another history row. These dependencies describe this history's write boundary; they do not review the separate fanout table.
4. A successful append acknowledgement proves durable ServiceVersionChain retention. ServiceVersionRepo can then delete the acknowledged pending publication. A lost reply or failed local deletion causes exact redelivery against immutable output; it does not authorize reevaluation.
5. An already materialized original recovers complete output from local pending publication, otherwise exact permanent `commands`, before fresh evaluation/declaration work. Recovery validates association with authoritative ServiceChain input outside SQL/execution permits. Missing or conflicting committed output fails recovery; resource state or an outcome-only source row cannot replace it.
6. ServiceChain separately retains original `commands.outcome` and complete pending external requests atomically. An exact equal-outcome retry returns before recreating requests. Full output must therefore remain recoverable here after publication deletion, including stable original external IDs, when the original receiving reply was lost.
7. Projection catch-up reads permanent commands. Pending delivery has its separate reader; subscriber acknowledgement/pruning deletes only pending fanout rows. Later enrollment can reconstruct delivery from retained commands. Projection resource/checkpoint/selected-publication commits remain separate durable facts.
8. `getServiceResult` reads an exact retained row. `getInputCheckpoint` reads the current or requested retained prefix without progressing execution; index zero yields the genesis checkpoint with null command ID. Neither reader changes original outcome retention or materialization progress.

**Deletion condition:** none in the supported lifecycle. Retain commands for the lifetime of this release-local history. Publication acknowledgement, all current subscribers acknowledging, external observation admission and original outcome retention do not delete it. Pruning this history would break later catch-up, exact committed-result recovery or immutable duplicate comparison and requires a separately designed retention policy.

- [Atomic source publication](../../../packages/system-worker/src/ServiceVersionRepo/utils/retainServiceResultTx.ts#L22-L58), [ServiceVersionChain producer lease and append](../../../packages/system-worker/src/ServiceVersionChain/ServiceVersionChain.ts#L187-L210), [synchronous transaction semantics](../../../packages/core/src/drizzle/make/makeTx.ts#L69-L118), [atomic history/fanout insertion](../../../packages/system-worker/src/ServiceVersionChain/appendExecutionPacketsTx.ts#L151-L171).
- [Source publication delivery](../../../packages/system-worker/src/ServiceVersionRepo/ServiceVersionRepo.ts#L84-L163), [pending page deletion after acknowledgement](../../../packages/system-worker/src/makeOutboxQueue/makeOutboxQueue.ts#L188-L233), [success envelope before acknowledgement](../../../packages/core/src/outbox/makeOutboxDelivery.ts#L286-L294), [duplicate ordering and recovery](../../../packages/system-worker/src/ServiceVersionRepo/executeCommand/executeCommand.ts#L39-L106), [pending-to-history result lookup](../../../packages/system-worker/src/ServiceVersionRepo/readCommandResult.ts#L31-L68).
- [Original outcome/request transaction](../../../packages/system-worker/src/ServiceChain/recordOriginalCommandOutcomeTx.ts#L31-L112), [fanout-only pruning and history backfill](../../../packages/system-worker/src/ServiceVersionChain/ServiceVersionChain.ts#L68-L101), [separate catch-up/delivery readers](../../../packages/system-worker/src/ServiceVersionChain/ServiceVersionChain.ts#L144-L149), [projection atomic commit](../../../packages/system-worker/src/serviceProjection/applyExecutionPacketsTx.ts#L78-L137), [retained results/checkpoints](../../../packages/system-worker/src/ServiceVersionChain/ServiceVersionChain.ts#L214-L289).

## Reconciled finding and verification limits

Both independent source reviewers support retaining the ten columns and immutable lifecycle. Full admitted input remains ServiceChain-owned; complete release-local output remains ServiceVersionChain-owned. No further schema simplification, consumer cleanup or ordinary-path correctness defect was identified. Fanout representation and subscriber state remain separate upcoming reviews.

This turn changes only this finding and Plan 151. No production code/schema, tests, fixtures, runners, configuration or storage are changed. All verification remains deferred: no typecheck, lint, tests, builds, acceptance, formatting, whitespace/link/range validation, storage-preservation comparison or independent implementation verification ran. Plans 196, 211, 212 and 213 retain their independent obligations. Plan 214 subsequently completed verification on 2026-10-22 as recorded above. No reset or deployment is performed or proposed. The reviewers' source findings remain distinct from Plan 214's subsequent runtime proof.

**Next table:** ServiceVersionChain.actorVersionRepoFanout. Its payload copy and deletion lifecycle have not been approved by this commands-table review.
