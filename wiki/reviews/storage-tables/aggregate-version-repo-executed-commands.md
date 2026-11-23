# AggregateVersionRepo.executedCommands

**Reviewed:** 2026-10-15

**Status:** Historical review of the removed AggregateVersionRepo table. Completed Plans 189/190 and [ADR 013](../../adrs/013-aggregate-delivery-history-and-projection-ownership.md) supersede the intermediate retained-AVR-history/one-column-marker proposals. Current checkpoint, complete pending messages and separate Chain history each require their own purpose review; implementation verification is complete.

**Review queue:** [Plan 151](../../plans/151-plan-storage-table-review.md).

**Recalibration (2026-10-15):** Everything below this metadata describes the pre-Plan-190 source and intermediate proposals, including statements labeled "current" and the ten-plus-one shapes. These are historical, not implementation instructions. Current recovery consults authoritative Chain input rather than simply weakening equality to ID/position. Use [Plan 151](../../plans/151-plan-storage-table-review.md) for the recalibrated queue.

Source-link destinations follow current module names; the historical source claims below retain their original meaning.

## Verdict and concrete owner

One immutable row records **this release's finalized execution of one admitted command**: its frozen input, local outcome and position in local execution history. It records success or retained public refusal. The physical Repo already identifies `{ systemId, aggregateId, aggregateName, aggregateVersion }`. Original execution and replay each write their own local journal; this table is not a second admission queue. [Owner](../../../packages/system-worker/src/AggregateVersionRepo/aggregateVersionRepoName.ts), [sole writer](../../../packages/system-worker/src/AggregateVersionRepo/utils/retainEvaluatedCommandTx.ts), [materialization](../../../packages/system-worker/src/AggregateVersionRepo/materializeCommandTx.ts).

The initial review examined 16 columns. After Plan 188 there are **17 current declared columns**, with `aggregateIndex` the integer primary key and `id` separately unique. Only `externalOutcome`, `nodeId`, `sessionName` and `pushIndex` are nullable. No framework column, pending status, retry counter or extra head row is synthesized. Plan 188 added required `executionStartedAt`. [Declaration](../../../packages/system-worker/src/AggregateVersionRepo/aggregateVersionRepoDbConfig.ts).

The agreed split is by recipient: all local execution results feed downstream projections, while only original execution owes its outcome to AggregateChain. Recommend ten-column retained `executionResults` and one-column pending `commandOutcomeOutbox`. The result survives acknowledgement; the pending marker does not.

This replaces the earlier 14-field proposal. Retaining the original release on incoming replay input does not justify copying it to an output row. No independent post-execution use was found for the stored input payload, external observation, input contract version or admitted aggregate version beyond complete-command transport and full-input duplicate comparison. Those contracts must change explicitly rather than dictate the result's shape.

## Columns in the historical source snapshot

All fields are inserted together and remain immutable. No production update or pruning path was found.

| Column               | Actual purpose and reader                                                                                                                                                    | Disposition                                                                                                                                 |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                 | Stable admitted command identity. Unique in this journal; joins model output, identifies checkpoint history and completes the originating command.                           | Retain as `commandId`: this identifies the command, while `aggregateIndex` expresses its position.                                          |
| `commandName`        | Names the admitted contract within its retained owner/Origin context. Used for local identity comparison and complete result delivery.                                       | Retain for projected browser command identity/name; it does not require copying the rest of the input.                                      |
| `payload`            | JSON text encoded using the admitted contract's input schema. Local duplicate comparison checks the retained text; inspection/recovery returns it.                           | Remove from execution results. AggregateChain retains authoritative input; replace local full-input duplicate comparison explicitly.        |
| `externalOutcome`    | Frozen external observation supplied to a continuation; null for ordinary commands. Retained for exact input identity and complete result delivery.                          | Remove from execution results. Needed on execution/replay input, not to apply or deliver completed model output.                            |
| `contractVersion`    | Version identifying the admitted payload/declaration encoding and its lineage. Part of frozen input.                                                                         | Remove from execution results. It describes admitted input encoding, not the local result codec.                                            |
| `aggregateId`        | Aggregate instance identity, checked against the physical Repo before execution. Used again in complete-command recovery and projection validation.                          | Remove stored copy; derive delivery owner context from the bound Repo key.                                                                  |
| `aggregateName`      | Aggregate declaration name, also checked against the physical Repo. Same recovery/projection context.                                                                        | Remove stored copy; derive delivery owner context from the bound Repo key.                                                                  |
| `aggregateVersion`   | Release under which the command was admitted. Replay preserves it even while running another release's implementation.                                                       | Remove from execution results; do not add `admittedAggregateVersion`. Incoming source-release semantics remain essential before evaluation. |
| `nodeId`             | Originating producer Node. Null together with the other producer fields for commands without that producer association. Used for private completion routing.                 | Retain the settled producer tuple.                                                                                                          |
| `origin`             | Actor/agent identity or explicit System authority, including actor claims. Part of input equality and private completion ownership.                                          | Retain canonical Origin variants. The physical owner cannot supply caller identity.                                                         |
| `sessionName`        | Originating session name within the retained producer/Origin context. Null with the rest of the producer tuple.                                                              | Retain with `nodeId` and `pushIndex`.                                                                                                       |
| `pushIndex`          | Positive producer-stream position, used to acknowledge/complete the originating command. Null with the producer tuple.                                                       | Retain. It is distinct from aggregate order.                                                                                                |
| `commandOutcome`     | This execution release's terminal success or retained public refusal, with the time that outcome was recorded.                                                               | Retain. Required here because no pending execution row is inserted.                                                                         |
| `dispositionHash`    | Materialized digest of the local command disposition prefix through this row. Checkpoint reads and the next execution use it.                                                | Retain for exact historical and latest checkpoints without scanning/re-hashing the prefix. Its coverage is limited below.                   |
| `aggregateIndex`     | Admitted aggregate-stream position; also the local journal's primary key. Highest retained row gives local execution progress.                                               | Retain. Replay must consume the same order, not allocate a separate release-local counter.                                                  |
| `executionVersion`   | Version of the release that produced this row's outcome/model output. The sole writer receives exactly `key.aggregateVersion`. Projection checks it against its own release. | Remove stored copy; bind result delivery to this Repo's execution release.                                                                  |
| `executionStartedAt` | Pre-evaluation sample used for source and projection resource application. Required since Plan 188. Immutable.                                                               | Retain on the execution result, preserving the exact sample through delivery and recovery.                                                  |

[Owner/input checks](../../../packages/system-worker/src/AggregateVersionRepo/utils/readAggregateCommandTx.ts), [local duplicate equality](../../../packages/system-worker/src/AggregateVersionRepo/validateCommandIdentity.ts), [result recovery](../../../packages/system-worker/src/AggregateVersionRepo/readEvaluatedCommand/readEvaluatedCommand.ts), [paging/output association](../../../packages/system-worker/src/AggregateVersionChain/AggregateVersionChain.ts), [projection validation](../../../packages/system-worker/src/aggregateProjection/applyEvaluatedCommands/bindProjectionCommand.ts), [private completion](../../../packages/system-worker/src/aggregateProjection/applyEvaluatedCommands/applyEvaluatedCommandsTx.ts).

## Two release meanings, one physical owner

For an admitted release A replayed by release B:

- The frozen command still names A. Resolving source declarations, actor lineage and external observations depends on that fact.
- The executing Repo is B. Its bound implementation determines local model versions and the locally encoded success result.
- The local `commandOutcome` and disposition belong to B. Replay does not overwrite the Chain's original outcome.

Consequently, substituting the executing release for the incoming command's source release would change the input. Removing the stored source-release copy from the completed result does not make that substitution. The original-execution path requires the admitted release to match the Repo; replay deliberately permits the difference. [Occurrence validation](../../../packages/system-worker/src/AggregateVersionRepo/utils/readAggregateCommandTx.ts), [source and local implementation resolution](../../../packages/system-worker/src/AggregateVersionRepo/utils/resolveAggregateExecution.ts), [local result encoding](../../../packages/system-worker/src/AggregateVersionRepo/utils/evaluateAggregateCommand.ts).

`contractVersion` identifies admitted input encoding. Payload adaptation follows the selected contract's declared previous/next lineage; it does not rewrite retained input. The complete incoming command supplies context for implementation selection during evaluation, and successful output is encoded through that selected local implementation. Downstream delivery carries the already encoded outcome JSON; its current consumers do not need the input contract version to apply model output or route completion. Do not add a speculative result-version column. [Payload lineage](../../../packages/core/src/contracts/decodeAndAdaptPayload/decodeAndAdaptPayload.ts), [result encoding](../../../packages/system-worker/src/AggregateVersionRepo/utils/evaluateAggregateCommand.ts).

The new stored result and its delivery DTO must be described directly as an execution result. Current `IAggregateResult.command` exposes the DB row and recovery decodes it as a complete final command. Replace that coupling; do not reconstruct a fictitious full command with invented input/version values. Existing source/recipient capabilities still bind owner identity and executing release on delivery. [Current result type](../../../packages/system-worker/src/AggregateVersionChain/evaluatedAggregateCommand.ts), [current recovery decoder](../../../packages/system-worker/src/AggregateVersionRepo/readEvaluatedCommand/readEvaluatedCommand.ts), [result inspection](../../../packages/system-worker/src/AggregateVersionRepo/AggregateVersionRepo.ts).

## Structured fields and null meanings

`origin` is exactly one of:

- Actor: `{ kind: 'actor', actorName, actorVersion, claims }`. Claims preserve the admitted identity values; this includes scope information used for private completion ownership. The claims record's authored keys are not extra physical columns.
- Agent: `{ kind: 'agent', agentName, agentVersion }`.
- System: `{ kind: 'system' }`, with no placeholder credential identity.

The producer tuple is either entirely null or a complete `(nodeId, sessionName, pushIndex)` in the canonical command schema. Aggregate command schemas do not independently restrict the complete-tuple branch to Actor Origin alone. Keep caller identity separate from producer delivery association. Projection uses both to decide which view may receive private completion; other views still apply their visible model changes. [Origin schemas](../../../packages/core/src/contracts/OriginSchema.ts), [aggregate union](../../../packages/core/src/contracts/AggregateCommandOriginSchema.ts), [command tuple](../../../packages/core/src/contracts/CommandSchema.ts), [ownership checks](../../../packages/system-worker/src/aggregateProjection/applyEvaluatedCommands/applyEvaluatedCommandsTx.ts).

`externalOutcome` is null for an ordinary command, or one frozen observation:

- Success: `{ _tag: 'Success', success, recordedAt }`, where `success` is portable JSON encoded with the external contract's response schema.
- Failure: `{ _tag: 'Failure', failure, recordedAt }`, where `failure` has `_tag: 'ExternalRequestFailure'`, code `external-producer-failed` and a message. A usable remote response was not obtained; it does not prove no remote effect occurred.

A successful `success: null` is distinct from absent `externalOutcome`. The retained observation is validated against the source external contract before use; replay does not repeat the external request. [Observation codec](../../../packages/core/src/contracts/ExternalOutcomeSchema.ts), [contract-bound validation](../../../packages/core/src/contracts/decodeExternalCommandInput.ts), [execution resolution](../../../packages/system-worker/src/AggregateVersionRepo/utils/resolveAggregateExecution.ts).

`commandOutcome` is required and has Success `{ _tag, success, recordedAt }` or Failure `{ _tag, failure, recordedAt }`. Success contains the local implementation's encoded result JSON. Public failure contains `_tag: 'ZerospinError'`, `code`, optional `scope` (`contract`, `actor` or `aggregate`), `message`, nullable numeric `status` and JSON `extra`. Both outcome timestamps encode as date strings inside their JSON columns. They are observations, not proof of transaction commit time. [Outcome codec](../../../packages/core/src/contracts/CommandOutcomeSchema.ts), [public failure codec](../../../packages/error/src/matchZerospinErrorCode.ts).

The approved `executionStartedAt` is a separate nonnullable date column. It preserves the existing pre-evaluation sample used for model application, even for zero-operation success or retained refusal. The outcome time is sampled later; neither can replace the other. [Selected move](../../archive/plans/188-plan-aggregate-version-repo-model-operation-storage.md), [start sample](../../../packages/system-worker/src/AggregateVersionRepo/utils/readAggregateCommandTx.ts), [later outcome sample](../../../packages/system-worker/src/AggregateVersionRepo/utils/makeEvaluatedAggregateCommand.ts).

## Input authority belongs to AggregateChain

The current implementation compares a redelivered complete encoded command against the locally retained full input. That is a chosen recovery contract, not proof that output delivery needs all input fields. Under the proposed result shape, AggregateChain remains the authoritative owner of admitted input. VersionRepo validates the bound owner, ordered position and repeated `(aggregateIndex, commandId)` association, then returns the retained local result without reevaluation. It no longer independently detects altered payload/version/observation fields under that same authoritative association. State this change explicitly; add no canonical-input copy or replacement fingerprint. [Current equality](../../../packages/system-worker/src/AggregateVersionRepo/validateCommandIdentity.ts), [current committed recovery](../../../packages/system-worker/src/AggregateVersionRepo/finalizeCommand/finalizeCommand.ts).

Replay still receives complete admitted commands from AggregateChain, including their original release, payload, external observation and input contract version. The compact result is neither replay input nor a replacement command receipt from admission.

## Pre-Plan-190 transaction, recovery and checkpoint lifecycle

1. Validate owner/release and inspect the latest local checkpoint. An already materialized position returns before evaluation or sampling a new start time. A new position must be exactly the next admitted aggregate index. Clear incoming outcome/hash before local evaluation so replay does not copy another release's result.
2. Evaluate, prepare and apply output inside the business savepoint. Success keeps its model changes/output. A recognized public refusal rolls business work back before retaining the refusal. Unclassified infrastructure failure, defect or interruption propagates without advancing the journal; some explicitly classified framework failures are retained public refusals.
3. Finalize the local outcome and extend its disposition prefix. Insert the immutable row in the same outer synchronous transaction as successful model output and original-only external work. Failure to retain the row rolls back that materialization.
4. Original execution acknowledges the retained result to AggregateChain. A lost acknowledgement can recover the existing local result and validate exact input without re-evaluation. Replay retains its own result and does not acknowledge a replacement original outcome to the Chain.
5. Read history in bounded aggregate order for actor/agent fanout. Projection validates the complete occurrence before skipping a repeated prefix, applies model changes transactionally and commits private completion/selected browser deltas with its own progress.

[Occurrence preparation](../../../packages/system-worker/src/AggregateVersionRepo/utils/readAggregateCommandTx.ts), [savepoint/refusal classification](../../../packages/system-worker/src/AggregateVersionRepo/utils/executeAggregateCommandTx.ts), [outer transaction](../../../packages/system-worker/src/AggregateVersionRepo/materializeCommandTx.ts), [original execution](../../../packages/system-worker/src/AggregateVersionRepo/finalizeCommand/finalizeCommand.ts), [Chain acknowledgement](../../../packages/system-worker/src/AggregateChain/acknowledgeOriginalDispatch.ts), [replay](../../../packages/system-worker/src/AggregateVersionRepo/replayCommands/replayCommand.ts), [projection](../../../packages/system-worker/src/aggregateProjection/applyEvaluatedCommands/applyEvaluatedCommandsTx.ts).

The journal itself provides the execution head: no row means logical position zero. Exact nonzero checkpoint lookup returns that row's `{ aggregateIndex, commandId, dispositionHash }`, or null if absent. Genesis has position zero, null command ID and a deterministic digest. This differs from fanout acknowledgement and from the outbox allocator; none can substitute for it. [Checkpoint reader](../../../packages/system-worker/src/AggregateVersionRepo/readAggregateMaterializationHead.ts), [checkpoint API](../../../packages/system-worker/src/AggregateVersionRepo/AggregateVersionRepo.ts).

## What the disposition hash proves

The Aggregate server seed is SHA-256 of `zerospin.aggregate.disposition.v1`. Each row extends the prefix by hashing JSON `[previousHash, aggregateIndex, commandId, 'success' | 'failure', null | encodedPublicFailure]`. Storing each result allows direct latest-prefix extension and exact historical checkpoint reads. It is derived data with a concrete access purpose, not an unexplained diagnostic. [Server hash](../../../packages/system-worker/src/aggregateDispositionChainHash/aggregateDispositionChainHash.ts), [actual tuple](../../../packages/core/src/contracts/dispositionChainHash.ts).

The hash does **not** bind payloads, owner/version metadata, Origin, successful result content, model bodies or timestamps. Do not describe it as complete execution/output integrity. Under the proposed split, exact input consistency remains at Chain admission, while VersionRepo checks its retained command ID/position association; the hash substitutes for neither. [Existing Chain input equality](../../../packages/system-worker/src/AggregateChain/admitAggregateCommands/readRetainedCommand.ts). This review proposes no new hash column or broader hashing protocol.

## Superseded intermediate table proposal

### `executionResults`: ten retained fields

```ts
{
  aggregateIndex: number; // primary key; existing aggregate order
  commandId: string; // unique; existing admitted command ID
  commandName: string;
  origin: ActorOrigin | AgentOrigin | SystemOrigin;
  nodeId: string | null;
  sessionName: string | null;
  pushIndex: number | null;
  commandOutcome: CommandOutcome;
  dispositionHash: string;
  executionStartedAt: Date;
}
```

Retain one immutable row for every local original or replayed success/refusal, including zero-model-operation results. Keep the producer tuple all-null or complete. Full `commandOutcome` retains the locally encoded result/refusal and its first `recordedAt`, serving original receipt construction and local result recovery/inspection. Origin and producer fields control private completion; command name is preserved in selected browser command identity. The journal's position/hash still serve local and historical checkpoints.

Keep model changes in the agreed six-field `modelOperations`, joined by `commandId`. Do not copy them into a result JSON column. Retain both result and model history after current subscriber acknowledgement so later projections can catch up. The downstream fanout uses this retained result stream; do not add a second pending-only copy of every result.

### `commandOutcomeOutbox`: one pending field

```ts
{
  aggregateIndex: number; // primary key; references executionResults
}
```

Row existence means this original execution's outcome still needs acknowledgement from AggregateChain. Join the retained result to deliver `{ aggregateIndex, commandId, commandOutcome }`. The bound Repo supplies Chain identity and executing release. The outbox need not duplicate the outcome, command ID, input or owner fields. Original-only positions can be sparse; add no new enqueue counter, head, mode or sent flag.

1. Original execution atomically retains its result/model output and inserts this pending marker. Retained public refusals also enqueue. Replay inserts only its local result/model output.
2. Chain receipt intake binds the sender to the admitted command's designated original release and matches command ID plus aggregate position. A well-shaped replay result is insufficient authority to finalize the original command. Persist the first outcome; accept identical retries including `recordedAt` and reject conflicts.
3. Remove only the pending marker after Chain commit/acknowledgement. Lost acknowledgements redeliver the same retained outcome. Neither Chain nor projection acknowledgement deletes execution history or model output. A duplicate command after successful delivery must not recreate an acknowledged marker.
4. Replace the current completion-as-RPC-return path deliberately. Chain dispatch acknowledgement and waiting for completion become distinct durable facts: today's `commandOutcome === null` selector covers both. Settle their exact representation in the implementation subplan. Preserve finalized-predecessor ordering and contiguous replay availability; independent delivery retries do not promise independent business progress.

The recipient split is agreed. These names, ten-plus-one column shapes and Chain protocol details are proposed, not implemented. They replace the earlier admission-version rename/full-input retention recommendation. Plan 188 is complete and does not implement this split.

Independent lifecycle and design reviewers traced the initial 16 fields, the added timestamp, owner equality, input/result version meanings, recovery, projection privacy and hash coverage. Both reviewed the proposed ten-plus-one split and its duplicate/receipt authority requirements. The primary agent reconciled their findings with current declarations and writers. No source implementation, tests, generated capture or runtime storage inspection was performed by this review.

Base commit: `e551f2dda217753685666442ae29a15e1ef5c719`. Post-Plan-188 Aggregate declaration SHA-256: `6ab0b66ccd19a70de27227a6a192f4b218e0cc307b7ad8c317e6cb81b7641a3c`; sole journal writer SHA-256: `4466d263ab189ccfcd629c42cba5532090bc36d83e27971693d24037ae4b423f`. Other work continues in the checkout; recheck source before implementation. Changed fixed storage requires empty affected storage, without compatibility or an automatic reset.

Continue with AggregateVersionRepo.actorExecutionResultsFanoutSubscribers after settling this journal's proposals.
