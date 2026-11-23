# ServiceAgentNodeRepo.attemptedAgentWakes

## Approved implementation — 2026-10-22

**Current decision:** The maintainer approved and source implementation now uses
`attemptedAgentWakes(behaviorKey, resourceId)` in both Node Repo families under
[Plan 151](../../plans/151-plan-storage-table-review.md). Implementation and required verification are
complete; the evidence and proof boundaries are recorded in Plan 151 above. The former
`agentWakes` table, `wakeAt` and `attempted` columns and unattempted rows are removed.
There is one unique behavior/resource pair index, no primary/foreign key and no
replacement deadline, owner version, command correlation, generation or status field.

A SANR marker records that its complete automatic invocation was frozen while the
behavior/resource pair remains selected. Absence is not proof of selection or a
deadline; those facts derive from current selected resources and the matching Agent
definition. Row presence does not prove command admission, execution or retained
`outcome`.

- `reconcileAgentBehaviorsTx` validates every selected scheduled row's canonical
  Model/attributes and nullable safe-integer deadline before pruning or checking
  markers, including already-attempted pairs. Baseline/page transactions therefore
  retain validation before checkpoint commit and acknowledgement. Matching markers
  survive null/changed deadlines and pin replacement; only absent selected/scheduled
  pairs are pruned, alongside selected resources/head.
- Due reconciliation rechecks selection/time, validates the command payload and
  inserts a marker. `makeAgentNodeRuntime.reconcileTx` encodes and inserts the
  complete five-field Service invocation in that same synchronous transaction.
  Selector, validation, encoding or SQL failure rolls back both marker and pending
  input. Delivery deletion leaves the marker intact; selection exit may prune the
  marker while frozen input remains independently deliverable.
- The registered next-wake reader uses one synchronous local database transaction
  for installed head, selected resources, markers and pending delivery. It checks
  the applied/desired Service pin before invoking current-definition callbacks.
  Matching local state supplies the minimum unattempted non-null deadline; pending
  delivery independently requires a one-second retry. No remote lookup or historical
  definition registry is introduced.
- Same-pin initialization captures an initial scheduling failure, still runs the
  subscription/due/delivery pass and final alarm reconciliation, then reports the
  failures. A source/derived scheduling failure cannot suppress delivery of already
  frozen input. Pending delivery still refuses owner-pin replacement before mutation;
  it drains through the original pin before a new baseline is installed.
- Ordinary `WakeRegistry.reconcile()` and dispatch now establish a durable retry
  alarm before authored readers. Ordinary success preserves an earlier alarm that
  existed before protection without mistaking the new watchdog for a business
  deadline. Dispatch success replaces its watchdog from current responsibilities;
  failure/interruption retains retry protection, and failed overdue work waits one
  second instead of spinning immediately. SANR still explicitly owns WakeRegistry
  and dispatches `onAlarm()` through its configured runtime once.

[Two-column declaration](../../../packages/core/src/agentBehavior/agentBehaviorDbConfig.ts),
[validation, pruning, marker insertion and derived minimum](../../../packages/core/src/agentBehavior/reconcileAgentBehaviorsTx.ts),
[shared SANR materialization/delivery runtime](../../../packages/system-worker/src/agentNodeRepo/makeAgentNodeRuntime.ts),
[protective reconciliation and dispatch](../../../packages/system-worker/src/makeWakeRegistry/makeWakeRegistry.ts),
[existing System Harness caller](../../../packages/core/src/testing/systemHarness/reconcileHarnessAgents.ts).

The existing compiler/library graph and all 77 tests across eight files pass.
Four new Workerd cases cover both physical owners, including exact schema/index
shape, marker/command rollback, attempted-row validation, null/changed deadlines,
reader failure with independent frozen delivery, reconstruction and pin gating.
The additional registry case covers ordinary/final reader protection and recovery;
existing deadline, duplicate, exit, receipt and rebinding cases also pass. Scoped
lint, formatting, changed links/source ranges and independent review pass, with
only pre-existing lint warnings. No new test/fixture files were added.

Failed cold initialization is proved to reach canonical admission by an increased
attempt count before healthy Node activation, with exactly frozen input. Node SQL
inspection follows successful activation and proves final drain and preserved
materialization/markers; deletion durability during failed activation is not
claimed. Fixture baselines, selector/SQL faults, isolate restart and manually
dispatched native alarms do not establish autonomous timing, authentication or
catalogue deployment. Callback purity is not enforced; recurring schedules,
stateful/relative-time selectors and eligibility re-entry remain outside this
one-shot behavior. Changed fixed schemas require empty affected storage; no
existing store reset, compatibility path or further table review occurred.

## Historical source review — superseded four-column representation

The audit below preserves the source and recommendation at review time. Its
four-column descriptions, proposal/approval status and source-state words such as
“current” are superseded by the approved implementation above. Links to changed
modules identify those modules rather than preserving obsolete line ranges.

**Reviewed:** 2026-10-21 against current uncommitted source, with independent lifecycle and column-design reviewers. This finding covers exactly SANR's physical occurrence. AANR's use of the shared declaration remains separately unreviewed.

**Verdict: retain durable attempt identity; simplify four columns to two sparse marker columns.** Recommend `attemptedAgentWakes(behaviorKey, resourceId)`, where row presence means an automatic attempt was frozen while that pair remains selected. Derive current deadlines from selected resources and the exact applied behavior. `wakeAt` and unattempted rows duplicate derived state; the attempt fact itself is indispensable after delivery deletion. The current four-column lifecycle is sound; this is a data-model simplification, not a demonstrated recovery defect.

**Status:** Recommendation only, unapproved and unimplemented. The existing four-column implementation remains unchanged. [Plan 151](../../plans/151-plan-storage-table-review.md) retains separate review and implementation/verification status.

## Physical owner and row responsibility

ServiceAgentNodeRepo is an unversioned MigratableDO identified by `(systemId, serviceName, agentName)`. One current `agentWakes` row represents one selected resource under one named behavior with `onWake`: its latest derived deadline and whether SANR has frozen its one automatic command. Query-only behaviors create no wake rows. These are current scheduling/attempt facts, not retained attempt history, command history, admission acknowledgement or execution `outcome`.

The physical key already supplies System, Service and Agent identity. `behaviorKey` identifies an authored behavior that binds one canonical Model; `resourceId` identifies a resource within it. A separate Model name, Service version, producer identity, generation, sequence or command ID is unnecessary in this row. `materializationHead` binds the selected set to its applied release, and complete pending invocation input belongs in `commandDeliveryOutbox`.

- [Physical identity](https://github.com/morgs32/zerospin/blob/8c8902ad35e81b33887d7fdad3d625da7f326ef2/packages/system-worker/src/ServiceAgentNodeRepo/serviceAgentNodeRepoMigratableDORepoConfig.ts#L9-L20), [shared table composition](../../../packages/system-worker/src/agentNodeRepo/agentNodeRepoDbConfig.ts#L7-L9), [complete current declaration](../../../packages/core/src/agentBehavior/agentBehaviorDbConfig.ts).
- [Canonical behavior/Model binding](../../../packages/core/src/agent/makeAgentBehavior.ts#L82-L89), [one behavior query per Model](../../../packages/core/src/agent/compileAgentBehaviors.ts#L76-L98).

## Every current column

There are four declared columns and no defaults: required TEXT `behaviorKey`/`resourceId`, nullable INTEGER `wakeAt` and required INTEGER-backed boolean `attempted`. There is one unique `(behaviorKey, resourceId)` index, no declared primary key or foreign key, and no synthesized ID/timestamp. The boolean codec supplies runtime meaning; SQL declares an INTEGER rather than an explicit boolean-value CHECK. No additional index is justified by the current full-table readers.

| Field         | Current meaning, null rule, mutability, writer/reader                                                                                                                                                                                                                                                               | Derivability and disposition                                                                                                                                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `behaviorKey` | Required authored behavior record key. Reconciliation matches prior attempts by this key and resource ID, and the declaration supplies its Model/deadline/contract callbacks. Rebuilt with current selection; removal or renaming changes which marker matches.                                                     | Not derivable from SANR's Agent name or a resource alone. Retain as part of sparse attempt identity; no new opaque ID is needed.                                                                                                          |
| `resourceId`  | Required selected resource identity within the behavior's Model. Multiple resources can have independent deadlines and attempts. Reconciliation copies `resource.id` and matches prior responsibility by the pair.                                                                                                  | Service/Agent identity cannot supply it. Retain. No FK to resource ID alone would correctly express the mixed-Model selected table; synchronous pruning owns the relationship.                                                            |
| `wakeAt`      | Latest derived absolute millisecond deadline, refreshed by `behavior.getWakeAt(resource)`. Null means no current deadline, not selection exit or attempted status. `nextAgentBehaviorWake` reads it only for unattempted rows. It can change without clearing the attempt bit.                                      | Fully derivable from durable selected contents and the exact applied behavior. Remove the stored cache; derive the current minimum for the existing registry reader. This changes the reader, not the one-shot requirement.               |
| `attempted`   | Required decoded boolean, explicitly initialized false in reconciliation rather than by a SQL default. It becomes true only when due input is generated and the outer transaction freezes complete delivery. While the pair remains selected, later null/deadline changes and matching pin replacement preserve it. | The fact cannot derive from resources or a drained outbox. Preserve it through marker-row existence, removing false rows and the redundant boolean column. Presence means frozen attempt, not admission, execution or retained `outcome`. |

All current writes flow through `reconcileAgentBehaviorsTx`: it reads prior rows, recomputes deadlines, preserves matching attempts and synchronously replaces the table. The scheduling reader selects the earliest non-null deadline whose row is unattempted. No other current SQL reader requires the deadline cache as an independent fact.

- [SQL representations](../../../packages/shapes/src/primitiveMaps.ts#L110-L151), [current reconciliation and sole writer](../../../packages/core/src/agentBehavior/reconcileAgentBehaviorsTx.ts), [deadline reader](../../../packages/core/src/agentBehavior/reconcileAgentBehaviorsTx.ts).
- [Exact Model/attribute decoding and deadline validation](../../../packages/core/src/agent/makeAgentBehavior.ts#L121-L168).

## Current lifecycle and transaction boundaries

1. **Baseline/pages:** SANR installs selected resources, checkpoint and wake reconciliation in one synchronous transaction. Page receipt reconciles without firing commands. Exact scheduled Model decoding and nullable safe-integer deadline validation occur before that transaction commits; invalid input does not gain acknowledgement first.
2. **Due processing:** An Agent pass requires the matching installed pin, catches up selected public history, then rereads local resources. It recomputes deadline and payload, samples time and requires non-null `wakeAt <= now` with no previous attempt. Marking attempted and encoding/inserting the complete five-field Service invocation share the same synchronous transaction. Selector, validation, encoding or insertion failure rolls back both attempt and delivery.
3. **Delivery:** Retry sends the same frozen input until exact durable admission acknowledgement permits deleting its delivery row. That deletion does not clear `attempted`. A retained execution Failure does not permit another automatic command. An outbox-empty inference would therefore lose necessary attempt memory and freeze a second command.
4. **Selection exit/null:** Authoritative selection exit removes current resource/wake responsibility together and leaves previously frozen delivery intact. A null deadline alone retains the row and any attempt bit; changing a deadline never resets it. The guarantee is one attempt while continuously selected. Exit deletes that memory; later re-entry can acquire fresh responsibility mechanically, without any general recurring/re-entry guarantee.
5. **Reconstruction/rebinding:** Same-pin reconstruction retains attempts and current selected state. Pending delivery obstructs changed-pin installation before mutation; old-pin delivery must drain first. Replacement installs selected resources/head/wakes atomically, preserving matching behavior/resource attempt pairs and rejecting old-source pages. No generation is needed to preserve this limited responsibility.

- [Resource/page/checkpoint transaction](../../../packages/system-worker/src/agentNodeRepo/makeAgentNodeRuntime.ts), [attempt plus frozen Service input](../../../packages/system-worker/src/agentNodeRepo/makeAgentNodeRuntime.ts), [rollback](../../../packages/core/src/drizzle/make/makeTx.ts#L70-L120).
- [Independent delivery and due pass](../../../packages/system-worker/src/agentNodeRepo/makeAgentNodeRuntime.ts), [baseline/pending-pin guard](../../../packages/system-worker/src/agentNodeRepo/makeAgentNodeRuntime.ts), [exact Service admission receipt](../../../packages/system-worker/src/ServiceAgentNodeRepo/ServiceAgentNodeRepo.ts#L123-L156).

## Alarm ownership and limits

SANR explicitly constructs WakeRegistry before its runtime; activation initializes scheduling, and `onAlarm` invokes that registry through the configured runtime/invocation wrapper. Registration itself is inert. The next-wake reader currently combines the earliest unattempted resource deadline with an independent one-second pending-delivery retry. Thus empty selection, null deadlines or attempted rows do not suppress pending delivery.

`WakeRegistry.run()` arms a protective retry alarm before invoking passes and its final deadline readers. Ordinary `reconcile()` reads deadlines before writing an alarm and does not establish that protection. After a failed pass, dispatch delays overdue retries by one second, avoiding an immediate failed-overdue loop. A completed pass reconciles the alarm from current durable responsibilities and replaces its watchdog. Ordinary reconciliation can preserve an already-earlier future alarm; it does not always set the exact current minimum. Early dispatch is harmless because due processing rechecks selection/time. No per-resource alarm ID, completion poller or second RecoveryRegistry is required.

- [Concrete registry construction](../../../packages/system-worker/src/ServiceAgentNodeRepo/ServiceAgentNodeRepo.ts#L69-L89), [alarm/activation hooks](../../../packages/system-worker/src/ServiceAgentNodeRepo/ServiceAgentNodeRepo.ts#L161-L168), [deadline plus independent delivery retry](../../../packages/system-worker/src/agentNodeRepo/makeAgentNodeRuntime.ts).
- [Alarm selection and earlier-alarm preservation](../../../packages/system-worker/src/makeWakeRegistry/makeWakeRegistry.ts), [protection, inert registration and failed-pass reconciliation](../../../packages/system-worker/src/makeWakeRegistry/makeWakeRegistry.ts).

## Proposed sparse representation and required coordinated changes

```text
attemptedAgentWakes
  behaviorKey TEXT NOT NULL
  resourceId  TEXT NOT NULL
  UNIQUE (behaviorKey, resourceId)
```

Store only attempted pairs. Absence means no attempt has been frozen for a currently selected behavior/resource pair. Preserve existing marker presence across null/deadline changes and matching rebinding; prune it only when that current selected/scheduled pair disappears. This is a current marker set, not a retained attempt log. Keep complete frozen delivery independently even after its marker is pruned.

The proposed name makes row-presence meaning explicit; it replaces the current table rather than retaining an alias. No constant true field, command correlation, new table alongside it, owner-version copy, recurrence state or replacement hash is needed.

The implementation cannot be a declaration-only removal:

1. Derive the earliest unattempted non-null deadline from a coherent synchronous observation of installed head, selected resources and markers. Gate the applied/desired pin **before** invoking current-definition callbacks. Use only local state and the matching definition; add no historical-definition registry or remote query. Keep the existing WakeRegistry registration interface.
2. Preserve exact resource/Model and deadline validation inside baseline/page transactions before acknowledgement. Do not move all validation into the later alarm reader. Prune obsolete markers in the same selected/head transaction and preserve matching attempted pairs on pin replacement.
3. Recheck current selection/time when due, then atomically insert the marker and complete pending invocation. Preserve rollback if either operation fails; never infer attempt status from outbox presence or a later execution `outcome`.
4. Preserve pending-only retries, protective alarm ordering and independent settlement of frozen delivery when source synchronization or derived scheduling fails. A scheduling callback error must not prevent delivery of already frozen input. Handle derived-reader failure during ordinary `reconcile()` explicitly: its reader runs before any alarm write, so the dispatch watchdog alone does not protect that call. Verify retry preservation at both entry paths.
5. Coordinate the shared reconciler/runtime, its existing System Harness caller, table composition, declaration reservations, source documentation and existing representation assertions. AANR's physical occurrence still needs its own review before a shared cutover is approved. Changed fixed storage requires empty affected storage, with no fallback decoder, row translation or automatic reset.

The cost is that scheduling reads decode selected resources and execute deadline selectors instead of scanning only cached SQL deadlines. That adds coherent-read, binding and failure-handling work, but no durable lifecycle mechanism. Shopping's current reservation behavior returns the selected row's fixed `expiresAt`; it needs no retained false/null scheduling rows. Callbacks are arbitrary functions and purity is not enforced, so this recommendation does not promise stable semantics for stateful or relative-time selectors. Current due reconciliation already reevaluates them.

- [Current actual deadline/payload declaration](../../../examples/shopping/src/zerospin/agents/reservationsAgentNodeDefinition.ts#L20-L33), [shared System Harness caller](../../../packages/core/src/testing/systemHarness/reconcileHarnessAgents.ts#L20-L35), [direct representation assertions](../../../packages/system-worker/tests/workerd/agent-node-service.workerd.spec.ts).

## Independent reconciliation and verification limits

The lifecycle reviewer initially retained all four fields because the current lifecycle is correct. The column reviewer proposed sparse markers. After explicitly checking null/deadline changes, selection exit, reconstruction, pin replacement, failure boundaries and alarm recovery, both support the two-field proposal under the preserved boundaries above. SQL-only deadline reading is useful convenience, not a separate correctness requirement. Selected materialization owns eligibility and deadline inputs; the marker set owns the otherwise lost attempt fact.

Earlier [Plan 249](../../archive/plans/249-plan-aggregate-agent-backend-node.md), the [five-field SANR outbox follow-up](service-agent-node-repo-command-delivery-outbox.md#approved-implementation-follow-up) and the retired `wake-registry.spec.ts` cases recorded historical evidence for the **four-column representation**. Current direct cases live in [agent-node-service.workerd.spec.ts](../../../packages/system-worker/tests/workerd/agent-node-service.workerd.spec.ts) and [alarm-registries.workerd.spec.ts](../../../packages/system-worker/tests/workerd/alarm-registries.workerd.spec.ts); [Plan 257](../../archive/plans/257-plan-direct-system-worker-verifications.md) tracks their migration. No tests were rerun for this review; its historical evidence does not prove the proposed sparse representation. Required future verification must cover its derived reader, transaction validation/rollback, deadlines, reconstruction, pending-only retry and marker preservation/pruning. General recurring schedules, retiming generations and eligibility re-entry remain outside the agreed scope.

Only this finding and Plan 151 change. Local links/source-range bounds, queue markers, bounded source preservation and whitespace were checked. Production source/schema and existing storage stayed unchanged; no runtime/type/lint/test/build checks, tests, fixtures, reset, publication or deployment ran. Generic command-operation durable delivery verification remains separate outstanding work.

**Next table:** AggregateAgentNodeRepo.agentWakes. This recommendation does not automatically approve that physical occurrence or a shared implementation.
