# AggregateAgentNodeRepo.commandDeliveryOutbox

**Current decision — 2026-10-21: approved, implemented and verified.** Retain complete pending delivery as five invocation fields: `id`, `commandName`, `contractVersion`, exact encoded `payload` and `aggregateVersion`. The enclosing `command` JSON column is removed. The historical audit below explains the original finding; it did not itself authorize implementation.

## Approved implementation follow-up

`AggregateAgentNodeRepo.commandDeliveryOutbox` now declares exactly those five required, immutable fields. `id` uses the `cmd` ID descriptor and is the sole SQL primary key; `payload` remains the unchanged contract-encoded JSON string in a TEXT column. There are no defaults, foreign keys or declared secondary indexes. The shared `agentNodeRepoDbConfig` owns selected resources and wakes; each family declares its own pending invocation codec.

- [`aggregateAgentNodeRepoDbConfig.ts:9-18`](../../../packages/system-worker/src/AggregateAgentNodeRepo/aggregateAgentNodeRepoDbConfig.ts#L9-L18) — declares the five-field row without an enclosing command or duplicated ID.
- [`makeAgentNodeRuntime.ts:140-174`](../../../packages/system-worker/src/agentNodeRepo/makeAgentNodeRuntime.ts#L140-L174) — freezes the encoded invocation through the matching family codec in the attempted-marker transaction.

On delivery, AANR constructs the complete ordinary admission request from the stored fields. Aggregate name and instance ID and `origin.agentName` come from its immutable physical key; `origin.kind` is `agent`; `externalOutcome`, `nodeId`, `sessionName` and `pushIndex` are constant nulls. Retry does not select the owner version, contract version or payload from the currently registered definition. The exact singleton receipt and positive safe canonical admission index still gate deletion. Selection exit still leaves frozen input deliverable; pending delivery still obstructs owner-pin replacement.

- [`AggregateAgentNodeRepo.ts:128-156`](../../../packages/system-worker/src/AggregateAgentNodeRepo/AggregateAgentNodeRepo.ts#L128-L156) — constructs the full request from the frozen row, key and constants, then validates the exact admission receipt.
- [`makeAgentNodeRuntime.ts:263-289`](../../../packages/system-worker/src/agentNodeRepo/makeAgentNodeRuntime.ts#L263-L289) — decodes each family's stored input and deletes only after its admission callback succeeds.
- [`makeAgentNodeRuntime.ts:329-344`](../../../packages/system-worker/src/agentNodeRepo/makeAgentNodeRuntime.ts#L329-L344) — refuses a changed pin while delivery remains before replacing selected resources and checkpoint.

This is the approved fixed-schema hard cutover: no serialized-column fallback, row translation or compatibility path remains. Existing storage was not reset. At the 2026-10-21 verification checkpoint, four focused cases in the retired `agent-runtime.spec.ts` Workerd suite passed for both families: exact five-column storage, complete request reconstruction, unchanged retries after lost or invalid replies, and pending-delivery reconstruction followed by pin obstruction, drain, rebinding and old-source fencing. `pnpm nx run zerospin:test` then passed compiler checks and 39 tests across eight files, including 15 Workerd cases. Scoped System Worker lint passed with zero errors and one existing unrelated warning. Scoped formatting, document links/ranges and `git diff --check` passed. Independent source review found no lifecycle regression. There is no remaining implementation or verification work for this outbox normalization. Prior [Plan 249](../../archive/plans/249-plan-aggregate-agent-backend-node.md) evidence below describes the earlier representation at its named seams. This follow-up does not close unrelated command-operation delivery verification or other table reviews. Current direct verification lives in [agent-node-aggregate.workerd.spec.ts](../../../packages/system-worker/tests/workerd/agent-node-aggregate.workerd.spec.ts); [Plan 257](../../archive/plans/257-plan-direct-system-worker-verifications.md) tracks the fixture removal and current checks.

## Historical source audit

The following audit records the pre-cutover two-column schema, recommendations and then-current evidence. Its source-file links identify the reviewed modules; old line anchors have been removed because those files now contain the approved implementation. Use the implementation citations above for current behavior.

**Reviewed:** 2026-10-21 against current uncommitted source, with independent lifecycle and column-design reviewers. Exactly this physical owner/table occurrence is reviewed. The earlier [SANR finding](service-agent-node-repo-command-delivery-outbox.md) supplies relevant shared-schema reasoning, not automatic approval of AANR.

**Original verdict: retain complete pending delivery; replace enclosing command JSON with five invocation fields.** Keep `id`, `commandName`, `contractVersion`, encoded `payload` and `aggregateVersion`. Derive Aggregate instance identity and Agent Origin from AANR's immutable key and supply constant null fields. No supported-path retry/deletion defect was found. Whole-command serialization violates the [local command-storage rule](../../patterns/system-worker/no-canonical-bytes-in-sql.md#never-store-canonical-bytes-in-sql); normalization is recommended, not approved or implemented by this review.

**Review queue:** [Plan 151](../../plans/151-plan-storage-table-review.md). No production code, schema, tests or storage change is part of this review.

### Physical scope and represented fact

AggregateAgentNodeRepo (AANR) is an unversioned MigratableDO identified by `(systemId, aggregateName, aggregateId, agentName)`. Its definition pins an exact Aggregate release. `aggregateName` and `aggregateId` identify the one Aggregate instance this Repo can command; they are not independently varying recipients. The separate AggregateAgentVersionRepo and AggregateAgentVersionChain retain owner-release-bound selected materialization and public history.

One row means AANR has committed an automatic attempt and still owes delivery of its exact frozen input to that instance's AggregateChain. Classify it as **complete pending delivery**. It is neither retained command history nor an execution `outcome`. AggregateChain may already have admitted the command while its reply is missing; pending-row presence means AANR has not validated the admission acknowledgement.

- [Physical key and schema binding](https://github.com/morgs32/zerospin/blob/8c8902ad35e81b33887d7fdad3d625da7f326ef2/packages/system-worker/src/AggregateAgentNodeRepo/aggregateAgentNodeRepoMigratableDORepoConfig.ts), [table composition](../../../packages/system-worker/src/AggregateAgentNodeRepo/aggregateAgentNodeRepoDbConfig.ts), [fixed recipient and complete receipt comparison](../../../packages/system-worker/src/AggregateAgentNodeRepo/AggregateAgentNodeRepo.ts).

### Current SQL columns and constraints

| Column    | Meaning, null/default rule and mutability                                                                                                                                                                     | Writer/readers                                                                                                                                              | Disposition                                                                                                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`      | Required TEXT primary key, no default. Canonical `cmd_…` command ID; immutable until deletion. The outer text descriptor does not itself validate the prefix; the command codec and sole writer establish it. | Due reconciliation allocates it once; `reconcileTx` inserts it. `deliverPending` deletes by this key after validated acknowledgement.                       | Retain once as canonical identity, uniqueness and deletion key. No producer identity or sequence is needed.                                                                     |
| `command` | Required TEXT containing complete command JSON, no default. Immutable until deletion; JSON null is invalid.                                                                                                   | AANR `makeCommand` constructs it; `reconcileTx` encodes/inserts it. `deliverPending` decodes it and AANR `admit` compares its exact input with the receipt. | Replace the enclosing serialization with the five variable fields below. An ID alone cannot recover a never-admitted command; copying the full wire object is also unnecessary. |

These are the only two declared columns. There are no framework-added timestamps, resource IDs, retry counters, admission indices, outcome columns, SQL defaults, foreign keys or declared secondary indexes. The primary key supplies uniqueness. A resource/wake foreign key would be wrong because frozen delivery must survive selection exit.

- [Current declaration](../../../packages/system-worker/src/agentNodeRepo/agentNodeRepoDbConfig.ts), [TEXT/JSON storage and key rendering](../../../packages/shapes/src/primitiveMaps.ts), [primary-key application](../../../packages/shapes/src/primitiveMaps.ts), [sole pending writer](../../../packages/system-worker/src/agentNodeRepo/makeAgentNodeRuntime.ts), [pending reader/deletion](../../../packages/system-worker/src/agentNodeRepo/makeAgentNodeRuntime.ts).

### Every frozen command field

| Field              | Actual AANR meaning and recommendation                                                                                                                                                                            |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`               | Same canonical identity as the SQL key. Store once and use that column in the complete admission request.                                                                                                         |
| `commandName`      | Exact ordinary contract selected at the attempt. Retain as a required immutable column; an Agent can declare multiple contracts.                                                                                  |
| `contractVersion`  | Exact positive integer contract revision. Retain as a column; current declarations cannot replace the frozen revision.                                                                                            |
| `payload`          | Contract-encoded JSON string selected at the attempt. Preserve unchanged in a TEXT column. Its authored keys are contract-specific; retry must not rerun the selector or decode/re-encode from current resources. |
| `aggregateVersion` | Exact owner release pinned when the attempt was frozen. Retain as a column because AANR's physical identity is unversioned.                                                                                       |
| `aggregateName`    | Name of AANR's sole Aggregate family. Derive from its immutable key.                                                                                                                                              |
| `aggregateId`      | ID of AANR's sole Aggregate instance. Derive from its immutable key, together with `aggregateName`.                                                                                                               |
| `origin`           | `{ kind: 'agent', agentName }`. Supply literal Agent kind and immutable key's Agent name; no Agent version, claims or credential placeholder is required.                                                         |
| `externalOutcome`  | Always null for this ordinary automatic command. Supply the constant.                                                                                                                                             |
| `nodeId`           | Always null; automatic commands have no browser producer identity. Supply the constant.                                                                                                                           |
| `sessionName`      | Always null; the observer session is not the automatic producer. Supply the constant.                                                                                                                             |
| `pushIndex`        | Always null; no Agent producer sequence exists. Supply the constant.                                                                                                                                              |

`systemId` selects the physical namespace and is not a command field. `aggregateVersion` and `contractVersion` retain distinct release/declaration facts. There is no independently variable Aggregate destination, Origin or producer context in this table's supported writer domain.

The shared codec additionally permits Service identity (`serviceName`, `serviceVersion` instead of Aggregate identity), Actor Origin (`kind`, `actorName`, `actorVersion`, arbitrary `claims` record), System Origin (`kind`), non-null producer coordinates and non-null external observations. External Success contains `_tag`, `success` JSON and `recordedAt`; external Failure contains `_tag`, `failure` (`_tag`, `code`, `message`) and `recordedAt`. AANR writes none of these branches. Its admission callback refuses a Service command, and ordinary Aggregate admission refuses non-null external observations. The broader storage domain and independently representable outer/nested IDs are not demonstrated runtime corruption paths: the sole writer always constructs the supported Aggregate/Agent shape and repeats the same allocated ID.

- [Complete AANR constructor](../../../packages/system-worker/src/AggregateAgentNodeRepo/AggregateAgentNodeRepo.ts), [encoded Aggregate fields/producer branches](../../../packages/core/src/contracts/CommandSchema.ts), [encoded Service branch](../../../packages/core/src/contracts/CommandSchema.ts), [Origin subfields](../../../packages/core/src/contracts/OriginSchema.ts), [external observation subfields](../../../packages/core/src/contracts/ExternalOutcomeSchema.ts).

### Lifecycle and acknowledgement boundary

1. Selected-page application commits resources, `materializationHead` and wake reconciliation synchronously; page receipt does not itself create due commands. An alarm pass synchronizes selected eligibility before freezing new attempts.
2. Due reconciliation allocates the canonical ID and marks the wake attempted. Payload encoding and pending insertion share the same synchronous transaction; failure rolls both back. Remote admission is outside SQL.
3. `deliverPending` attempts every captured row independently. Failed synchronization skips new freezing while still allowing existing frozen delivery. A failed admission reply cannot prevent another due resource's command from being frozen and delivered.
4. AANR sends the full command to AggregateChain using the physical key's System/instance identity. AggregateChain validates bound Aggregate identity, then checks retained ID before current new-command authorization. Equal retained input returns the original `aggregateIndex`; same-ID conflicting input fails.
5. AANR requires exactly one receipt, a positive safe `aggregateIndex` and equality of the complete frozen input after removing that index. Only success of this validation permits deletion by outbox `id`. Missing, mismatched or invalid replies preserve pending delivery.
6. Interruption before admission leaves the complete frozen input locally. Interruption after admission but before deletion retries that same ID/input and recovers its existing admission. Deletion proves acknowledgement of admission, not execution commit or retained `outcome`. A later execution Failure cannot cause another automatic attempt.
7. Selection exit removes current resources/wakes but never this pending command. Changed-pin activation refuses to replace state while delivery remains; an old-pin deployment drains it before rebinding. The pending-delivery reader independently schedules retries. Source review establishes the shared pin-change path; the existing direct runtime rebinding case exercises SANR only.

- [Atomic attempt and ID allocation](../../../packages/core/src/agentBehavior/reconcileAgentBehaviorsTx.ts), [due transaction and independent delivery settlement](../../../packages/system-worker/src/agentNodeRepo/makeAgentNodeRuntime.ts), [synchronous rollback](../../../packages/core/src/drizzle/make/makeTx.ts), [selection-exit/page transaction](../../../packages/system-worker/src/agentNodeRepo/makeAgentNodeRuntime.ts).
- [Exact AANR admission acknowledgement](../../../packages/system-worker/src/AggregateAgentNodeRepo/AggregateAgentNodeRepo.ts), [bound identity validation](../../../packages/system-worker/src/AggregateChain/admitAggregateCommands/validateAggregateSubmission.ts), [retained-ID recovery before new permission checks](../../../packages/system-worker/src/AggregateChain/admitAggregateCommands/admitAggregateCommandsTx.ts), [retained-input comparison](../../../packages/system-worker/src/AggregateChain/admitAggregateCommands/readRetainedCommand.ts), [pending-pin guard and retry reader](../../../packages/system-worker/src/agentNodeRepo/makeAgentNodeRuntime.ts).

### Recommended row and reconstruction

```ts
{
  id: string; // canonical command ID, primary key
  commandName: string;
  contractVersion: number;
  payload: string; // unchanged contract-encoded JSON
  aggregateVersion: number;
}
```

All five fields remain required, immutable and without defaults. The complete admission request is these frozen fields plus `aggregateId`/`aggregateName`/`agentName` from the immutable AANR key, literal Agent kind and four null constants. This follows the existing AggregateChain pattern of restoring Aggregate name/ID from its bound key. No additional index, discriminator, hash, sequence, acknowledgement copy, resource correlation or outcome storage is justified.

**Do not reuse the current `makeCommand` callback unchanged to reconstruct pending delivery:** it reads `#definition.aggregateVersion`. Delivery must instead use the row's frozen `aggregateVersion` and `contractVersion` without consulting the current Agent definition, selected resource, behavior selector or `materializationHead`. Ordinary Repo activation still resolves its registered definition; this recommendation does not introduce activation after registration removal or change the pending-pin obstruction.

- [Existing Aggregate command-row reconstruction](../../../packages/system-worker/src/AggregateChain/readAdmittedAggregateCommand.ts), [current constructor's definition-bound version](../../../packages/system-worker/src/AggregateAgentNodeRepo/AggregateAgentNodeRepo.ts), [governing storage rule](../../patterns/system-worker/no-canonical-bytes-in-sql.md#never-store-canonical-bytes-in-sql).

If implemented, update the writer, row reader and complete-request construction together as a fixed-schema hard cutover. Preserve attempt/insertion atomicity, unchanged input across retries, exact receipt validation, selection-exit survival and acknowledged-row deletion. Verify the new representation in empty disposable storage. Do not retain the serialized column, introduce a fallback decoder or translate deprecated rows. No reset of existing storage is authorized here.

### Reconciled finding and verification limits

Both independent reviewers support the five-field row for AANR itself. Aggregate instance identity is durable in the physical key; it adds no variable pending field beyond the SANR recommendation. The lifecycle is operationally coherent, but complete pending input does not justify the enclosing command serialization. This source review recommends normalization and finds no additional ordinary-path lifecycle defect.

Existing [Plan 249](../../archive/plans/249-plan-aggregate-agent-backend-node.md) Workerd evidence includes Aggregate-family exact retries after lost/mismatched/invalid replies, reconstruction/no reattempt, selection exit with continued frozen delivery and retained canonical Failure, and independent resource deadlines. Those checks concern the current serialized representation, not this proposed row. At that historical checkpoint, the retired fixture's rebinding test was Service-only; AANR's shared-runtime applicability was source-grounded and had no separate direct rebinding proof. Current Aggregate rebinding verification is tracked separately in [Plan 257](../../archive/plans/257-plan-direct-system-worker-verifications.md) and [agent-node-aggregate.workerd.spec.ts](../../../packages/system-worker/tests/workerd/agent-node-aggregate.workerd.spec.ts). This review qualifies that evidence without inventing or claiming another passing scenario. The generic command-operation delivery queue remains separately unverified.

Only this finding, Plan 151 and the narrow Plan 249 evidence qualification change. Local links/ranges and whitespace were checked. No runtime/type/lint/test/build checks were rerun, no tests or fixtures were added, and no production code, schema, storage or deployment changed.

**Next table:** ServiceAgentNodeRepo.selectedResources. AANR/SANR selected resources, materialization checkpoints and wakes remain separate physical review occurrences.
