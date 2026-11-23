# ServiceAgentNodeRepo.commandDeliveryOutbox

**Current decision — 2026-10-21: approved, implemented and verified.** Retain complete pending delivery as five invocation fields: `id`, `commandName`, `contractVersion`, exact encoded `payload` and `serviceVersion`. The enclosing `command` JSON column is removed. The historical audit below explains the original finding; it did not itself authorize implementation.

## Approved implementation follow-up

`ServiceAgentNodeRepo.commandDeliveryOutbox` now declares exactly those five required, immutable fields. `id` uses the `cmd` ID descriptor and is the sole SQL primary key; `payload` remains the unchanged contract-encoded JSON string in a TEXT column. There are no defaults, foreign keys or declared secondary indexes. The shared `agentNodeRepoDbConfig` owns selected resources and wakes; each family declares its own pending invocation codec.

- [`serviceAgentNodeRepoDbConfig.ts:9-18`](../../../packages/system-worker/src/ServiceAgentNodeRepo/serviceAgentNodeRepoDbConfig.ts#L9-L18) — declares the five-field row without an enclosing command or duplicated ID.
- [`makeAgentNodeRuntime.ts:140-174`](../../../packages/system-worker/src/agentNodeRepo/makeAgentNodeRuntime.ts#L140-L174) — freezes the encoded invocation through the matching family codec in the attempted-marker transaction.

On delivery, SANR constructs the complete ordinary admission request from the stored fields. Service name and `origin.agentName` come from its immutable physical key; `origin.kind` is `agent`; `externalOutcome`, `nodeId`, `sessionName` and `pushIndex` are constant nulls. Retry does not select the owner version, contract version or payload from the currently registered definition. The exact singleton receipt and positive safe canonical admission index still gate deletion. Selection exit still leaves frozen input deliverable; pending delivery still obstructs owner-pin replacement.

- [`ServiceAgentNodeRepo.ts:129-155`](../../../packages/system-worker/src/ServiceAgentNodeRepo/ServiceAgentNodeRepo.ts#L129-L155) — constructs the full request from the frozen row, key and constants, then validates the exact admission receipt.
- [`makeAgentNodeRuntime.ts:263-289`](../../../packages/system-worker/src/agentNodeRepo/makeAgentNodeRuntime.ts#L263-L289) — decodes each family's stored input and deletes only after its admission callback succeeds.
- [`makeAgentNodeRuntime.ts:329-344`](../../../packages/system-worker/src/agentNodeRepo/makeAgentNodeRuntime.ts#L329-L344) — refuses a changed pin while delivery remains before replacing selected resources and checkpoint.

This is the approved fixed-schema hard cutover: no serialized-column fallback, row translation or compatibility path remains. Existing storage was not reset. At the 2026-10-21 verification checkpoint, four focused cases in the retired `agent-runtime.spec.ts` Workerd suite passed for both families: exact five-column storage, complete request reconstruction, unchanged retries after lost or invalid replies, and pending-delivery reconstruction followed by pin obstruction, drain, rebinding and old-source fencing. `pnpm nx run zerospin:test` then passed compiler checks and 39 tests across eight files, including 15 Workerd cases. Scoped System Worker lint passed with zero errors and one existing unrelated warning. Scoped formatting, document links/ranges and `git diff --check` passed. Independent source review found no lifecycle regression. There is no remaining implementation or verification work for this outbox normalization. Prior [Plan 249](../../archive/plans/249-plan-aggregate-agent-backend-node.md) evidence below describes the earlier representation at its named seams. This follow-up does not close unrelated command-operation delivery verification or other table reviews. Current direct verification lives in [agent-node-service.workerd.spec.ts](../../../packages/system-worker/tests/workerd/agent-node-service.workerd.spec.ts); [Plan 257](../../archive/plans/257-plan-direct-system-worker-verifications.md) tracks the fixture removal and current checks.

## Historical source audit

The following audit records the pre-cutover two-column schema, recommendations and then-current evidence. Its source-file links identify the reviewed modules; old line anchors have been removed because those files now contain the approved implementation. Use the implementation citations above for current behavior.

**Reviewed:** 2026-10-21 against current uncommitted source, with independent lifecycle and column-design reviewers. Exactly this physical owner/table occurrence is reviewed. AANR's use of the shared declaration remains a separate review.

**Original verdict: retain complete pending delivery; replace enclosing command JSON with five invocation fields.** Keep `id`, `commandName`, `contractVersion`, `payload` and `serviceVersion`. Derive fixed owner identity and constant envelope fields from SANR's immutable key and protocol. Current retry/deletion behavior is sound, but the enclosing serialization violates the [local command-storage rule](../../patterns/system-worker/no-canonical-bytes-in-sql.md#never-store-canonical-bytes-in-sql). This representation change is recommended, not implemented or approved by this review.

**Review queue:** [Plan 151](../../plans/151-plan-storage-table-review.md). The earlier runtime evidence in [Plan 249](../../archive/plans/249-plan-aggregate-agent-backend-node.md) remains valid at its named seams; this source review does not verify `makeCommandDeliveryQueue` or recorded-command admission.

### Physical owner and represented fact

ServiceAgentNodeRepo (SANR) is an unversioned MigratableDO identified by `(systemId, serviceName, agentName)`. Its registered Agent definition pins an exact Service release. The distinct ServiceAgentVersionRepo and ServiceAgentVersionChain retain selected materialization/public history under that owner release.

One row means: SANR has committed a one-shot automatic command attempt and still owes delivery of that exact input to ServiceChain. This is **complete pending delivery**, not retained command history, an execution result or a producer cursor. ServiceChain may already have admitted the command while its reply is missing; row presence records SANR's unresolved acknowledgement responsibility, not proof of non-admission.

- [Physical identity and schema binding](https://github.com/morgs32/zerospin/blob/8c8902ad35e81b33887d7fdad3d625da7f326ef2/packages/system-worker/src/ServiceAgentNodeRepo/serviceAgentNodeRepoMigratableDORepoConfig.ts), [table composition](../../../packages/system-worker/src/ServiceAgentNodeRepo/serviceAgentNodeRepoDbConfig.ts), [pending declaration](../../../packages/system-worker/src/agentNodeRepo/agentNodeRepoDbConfig.ts).

### Every SQL column and constraint

| Column    | Meaning, null/default rule and mutability                                                                                                                                                                                 | Writer/readers                                                                                                                                                  | Necessity                                                                                                                                                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`      | Required TEXT primary key, no default. The canonical `cmd_…` command ID, immutable until deletion. The outer text descriptor alone does not validate the prefix; the complete command codec and sole writer establish it. | Due reconciliation allocates the ID once; `reconcileTx` inserts it. Delivery deletes exactly this ID after acknowledgement.                                     | Retain as the sole stored canonical ID, SQL uniqueness and deletion key. No new sequence or producer generation is needed.                                                                                                    |
| `command` | Required TEXT containing JSON, no default. Complete encoded command input, immutable until deletion. JSON null is not a valid command.                                                                                    | SANR `makeCommand` creates it; `reconcileTx` encodes/inserts it. `deliverPending` decodes it for unchanged retry; SANR `admit` compares the receipt against it. | Replace with the variable invocation fields below. Those facts must remain durable, but a serialized enclosing command and repeated key/constants are unnecessary. An ID alone still cannot recover a never-admitted command. |

These are the only two declared columns. There are no framework-added timestamps, resource IDs, admission positions, retry counters, outcome fields, SQL defaults, foreign keys or declared secondary indexes. The primary key supplies uniqueness. No foreign key to `attemptedAgentWakes` or selected resources belongs here: pending delivery must survive selection exit.

- [TEXT/JSON column rendering](../../../packages/shapes/src/primitiveMaps.ts), [table captures only the declared shape/indexes](../../../packages/shapes/src/makeTable.ts), [ID allocation and attempted marker](../../../packages/core/src/agentBehavior/reconcileAgentBehaviorsTx.ts), [outbox insertion](../../../packages/system-worker/src/agentNodeRepo/makeAgentNodeRuntime.ts), [delivery and deletion](../../../packages/system-worker/src/agentNodeRepo/makeAgentNodeRuntime.ts).

### Every field inside the frozen command

The shared table codec permits encoded Aggregate or Service commands. SANR's sole writer produces the following Service/Agent shape:

| Field             | Stored meaning and disposition                                                                                                                                                                                                                       |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`              | Same canonical ID as the SQL key. Derive the admission envelope's `id` from that one column.                                                                                                                                                         |
| `commandName`     | Exact ordinary contract name selected by the behavior when attempted. Retain as a column; an Agent can declare several contracts.                                                                                                                    |
| `contractVersion` | Exact positive integer declaration version. Retain as a column; retry must not choose a replacement contract definition.                                                                                                                             |
| `payload`         | Contract-encoded JSON **string**, frozen from the selected resource at the attempt. Its authored keys are contract-specific. Retain the exact encoded value in a TEXT column; retry must not rerun the selector or re-encode from current resources. |
| `serviceName`     | Bound Service name. Derive from SANR's immutable key, not its current Agent definition.                                                                                                                                                              |
| `serviceVersion`  | Exact owner release pinned when attempted. Retain as a column; SANR's physical identity is unversioned.                                                                                                                                              |
| `origin`          | Required `{ kind: 'agent', agentName }`; no Agent version, Actor claims or placeholder credentials. Derive the literal kind and immutable key's Agent name.                                                                                          |
| `externalOutcome` | Always `null` for this ordinary automatic command. Supply that constant when constructing the admission request.                                                                                                                                     |
| `nodeId`          | Always `null`; automatic execution has no browser producer identity. Supply the constant.                                                                                                                                                            |
| `sessionName`     | Always `null`; the observer session is not the automatic producer. Supply the constant.                                                                                                                                                              |
| `pushIndex`       | Always `null`; there is no Agent producer sequence. Supply the constant.                                                                                                                                                                             |

`systemId` belongs to the physical owner and selects the ServiceChain namespace; it is not an additional command field. The two versions above identify different facts: the Service release and the ordinary contract declaration.

The outer SQL `id` and nested `command.id` duplicate one value; the sole writer supplies both from the same allocation. SQL uniqueness does not independently check JSON equality. Persisting the variable invocation fields once removes that duplication without a hash, new identity or synchronization mechanism. Construct the complete ordinary admission request directly from those frozen fields, SANR's immutable key and the protocol constants. Never reconstruct variable input from the currently registered definition, selection, checkpoint or contract selector.

The broader shared codec also permits Aggregate identity (`aggregateId`, `aggregateName`, `aggregateVersion` in place of Service identity), Actor Origin (`kind`, `actorName`, `actorVersion`, arbitrary `claims` record), System Origin (`kind`), non-null producer coordinates, and non-null external observations. External Success contains `_tag`, `success` JSON and `recordedAt`; external Failure contains `_tag`, `failure` (`_tag`, `code`, `message`) and `recordedAt`. These are shared command-schema branches, not SANR-produced state. SANR refuses an Aggregate command before admission; ServiceChain's ordinary boundary rejects non-null `externalOutcome`. No supported writer uses these extra branches, so their representability is not an established lifecycle defect or a reason to add another storage path.

- [Sole SANR command constructor](../../../packages/system-worker/src/ServiceAgentNodeRepo/ServiceAgentNodeRepo.ts), [complete encoded command schemas](../../../packages/core/src/contracts/CommandSchema.ts), [Origin fields](../../../packages/core/src/contracts/OriginSchema.ts), [external observation fields](../../../packages/core/src/contracts/ExternalOutcomeSchema.ts), [ordinary Service admission boundary](../../../packages/system-worker/src/ServiceChain/admitServiceCommands/admitServiceCommands.ts).

### Transaction, retry and deletion lifecycle

1. Selected-page application commits resources, `materializationHead` and wake reconciliation synchronously. It does not create due commands while receiving a page. An alarm pass first synchronizes selected eligibility through a fixed published boundary.
2. Due reconciliation allocates one canonical command ID, marks the current wake attempted and inserts the complete command in one synchronous transaction. Failure rolls back the attempt and insertion together. No RPC or remote acknowledgement occurs inside that transaction.
3. `deliverPending` takes the current pending rows and attempts each independently. A failed reply cannot prevent another row from being delivered. Synchronization failure prevents fresh commands from being frozen but still permits previously frozen delivery.
4. SANR sends the exact decoded command to its bound ServiceChain. ServiceChain handles an existing ID before new-command permission checks, compares all retained input and returns the original `serviceIndex`; conflicting same-ID input fails. New admission retains the command synchronously before returning its receipt.
5. SANR requires exactly one receipt, a positive safe `serviceIndex`, and equality of every frozen input field after removing that receipt's index. Only callback success permits the single SQL deletion by outbox `id`. A lost reply, mismatched input or invalid index leaves the delivery row pending.
6. A crash after ServiceChain admission but before deletion retries the same command and recovers its existing admission. A crash before admission preserves the only complete frozen input. No execution `outcome` is needed to drain this table; a later retained execution Failure cannot create another automatic attempt.
7. Selection exit removes the current wake/resource responsibility but leaves frozen delivery intact. A changed owner pin refuses activation while any delivery remains; the previous pin must drain it. Only after that drain can SANR install the new baseline/checkpoint. Delivery deletion never deletes ServiceChain's retained admitted command or outcome.

- [Selected-page transaction](../../../packages/system-worker/src/agentNodeRepo/makeAgentNodeRuntime.ts), [synchronize/freeze/deliver pass](../../../packages/system-worker/src/agentNodeRepo/makeAgentNodeRuntime.ts), [synchronous transaction rollback](../../../packages/core/src/drizzle/make/makeTx.ts).
- [Receiver and exact receipt validation](../../../packages/system-worker/src/ServiceAgentNodeRepo/ServiceAgentNodeRepo.ts), [same-ID recovery before new admission](../../../packages/system-worker/src/ServiceChain/admitServiceCommands/admitServiceCommandsTx.ts), [full retained-input comparison](../../../packages/system-worker/src/ServiceChain/admitServiceCommands/readRetainedServiceCommand.ts).
- [Pending-pin obstruction and snapshot installation](../../../packages/system-worker/src/agentNodeRepo/makeAgentNodeRuntime.ts), [durable pending-delivery retry reader](../../../packages/system-worker/src/agentNodeRepo/makeAgentNodeRuntime.ts).

### Recommended row

```ts
{
  id: string; // canonical command ID, primary key
  commandName: string;
  contractVersion: number;
  payload: string; // unchanged contract-encoded JSON
  serviceVersion: number;
}
```

Each field is required, immutable and has no default. Keep the canonical ID uniqueness and acknowledgement-driven deletion. No secondary index, resource correlation, producer coordinate, copied acknowledgement or outcome belongs in this row. `serviceVersion` stays explicit even though pending delivery currently blocks rebinding: the invocation should not depend on reading another table to interpret its frozen owner release.

The local rule is explicit: “For command storage, persist the command's fields as the row.” It separately rejects preserving a whole-command serialization. Complete pending input is still required; completeness does not require copying an enclosing wire object. ServiceChain's ordinary `commands` table already stores `commandName`, `payload`, `contractVersion` and `serviceVersion` as fields and derives its fixed Service name from owner context.

- [Governing local rule](../../patterns/system-worker/no-canonical-bytes-in-sql.md#never-store-canonical-bytes-in-sql), [existing Service command row pattern](../../../packages/system-worker/src/ServiceChain/serviceChainDbConfig.ts), [Service name restored from immutable owner context](../../../packages/system-worker/src/ServiceChain/readServiceCommandOccurrence.ts).

This is a fixed-schema hard cutover if implemented: update the sole writer, pending reader and complete-request construction together, preserve existing transaction/receipt invariants, and verify in empty disposable storage. Do not keep the serialized column, add a fallback decoder or translate old rows. This review authorizes no existing-storage reset and no production change.

### Reconciled finding and verification limits

The lifecycle reviewer found no ordinary-path delivery/deletion defect. The column-design reviewer identified the explicit local-rule conflict and the five required invocation fields. Both reviewers confirm that the normalized row preserves exact retry, selection-exit survival, restart, rebinding obstruction and receipt-driven deletion without reading the current definition. An ID-only row would lose a never-admitted command after selection exit; keeping the whole wire object instead of its fields is also unjustified. This was the original source-audit conclusion; the approved follow-up above records its later implementation.

Plan 249's existing Workerd cases already exercise exact retry after lost/mismatched/invalid replies, reconstruction, pending-pin obstruction, selection exit with continued delivery and retained canonical Failure, and a second resource's independent deadline. They use real SANR, production ServiceChain admission procedures and disposable storage. They do not establish the separate AggregateChain command-operation delivery queue's guarantees. No runtime, type, lint, test or build check was rerun for this documentation-only review; local links/ranges and whitespace were checked. No storage was changed or reset.

**Next table:** AggregateAgentNodeRepo.commandDeliveryOutbox, under the same Plan 151. SANR/AANR selected resources, materialization checkpoints and wake tables remain separately unreviewed.
