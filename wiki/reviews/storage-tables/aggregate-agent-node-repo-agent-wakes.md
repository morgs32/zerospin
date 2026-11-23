# AggregateAgentNodeRepo.attemptedAgentWakes

## Approved implementation — 2026-10-22

**Current decision:** The maintainer approved and source implementation now uses
`attemptedAgentWakes(behaviorKey, resourceId)` in both Node Repo families under
[Plan 151](../../plans/151-plan-storage-table-review.md). Implementation and required verification are
complete; the evidence and proof boundaries are recorded in Plan 151 above. The former
`agentWakes` table, stored `wakeAt`/`attempted` and unattempted rows are removed.
Exactly two required text columns and one unique behavior/resource pair index remain,
without a primary/foreign key, generation or replacement scheduling state.

Within AANR's immutable `(systemId, aggregateName, aggregateId, agentName)` owner,
marker presence records one frozen automatic attempt for a continuously selected
behavior/resource pair. The selected resource and exact applied behavior supply
eligibility and deadline; the marker retains the otherwise lost attempt fact after
command delivery deletion. It is neither attempt history nor command admission or
execution evidence.

1. `reconcileAgentBehaviorsTx` validates every selected scheduled resource's exact
   Model/attributes and nullable safe-integer deadline before pruning or marker
   checks. Attempted rows still undergo validation. AANR baseline/page transactions
   therefore cannot acknowledge invalid scheduled data first. Matching markers survive
   null/changed deadlines and new-pin baseline installation; selected/scheduled exit
   prunes them in the same selected-resource/head transaction.
2. Due processing rechecks selection/time, validates payload and inserts the marker;
   runtime encoding and the complete five-field Aggregate invocation insert share
   that synchronous transaction. Validation/encoding/SQL failure rolls back marker
   and input together. The frozen command retains exact Aggregate release and its
   immutable instance/Agent context, including after selection exit. Delivery deletion
   does not authorize another attempt.
3. The registered next-wake reader observes the installed head, selected resources,
   markers and pending delivery in one synchronous local database transaction. It
   checks the applied/desired Aggregate pin before invoking current-definition
   callbacks. It derives the earliest unattempted deadline and independently schedules
   pending delivery after one second, with no remote query or historical registry.
4. Same-pin initialization records an initial reconciliation failure, still runs
   its subscription/due/delivery pass and final reconciliation, then reports failures.
   Frozen delivery runs even when source synchronization or derived scheduling fails.
   Changed-pin installation still refuses pending delivery before mutation; the
   original pin drains it before replacement, preserving matching attempt markers
   and existing previous-source fencing.
5. Ordinary `WakeRegistry.reconcile()` now protects its authored readers with an
   alarm before invoking them. It distinguishes the genuinely pre-existing alarm
   from newly provisional protection, so successful scheduling does not retain an
   unnecessary watchdog. Dispatch has the same protection; success reconciles durable
   responsibilities, while failure/interruption leaves retry protection and failed
   overdue work waits one second. AANR retains explicit registry ownership and one
   configured-runtime `onAlarm()` dispatch.

[Sparse declaration](../../../packages/core/src/agentBehavior/agentBehaviorDbConfig.ts),
[eager validation/pruning/marker and minimum derivation](../../../packages/core/src/agentBehavior/reconcileAgentBehaviorsTx.ts),
[AANR transactions, pending delivery and pin guard](../../../packages/system-worker/src/agentNodeRepo/makeAgentNodeRuntime.ts),
[alarm protection/reconciliation](../../../packages/system-worker/src/makeWakeRegistry/makeWakeRegistry.ts),
[shared System Harness caller](../../../packages/core/src/testing/systemHarness/reconcileHarnessAgents.ts).

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

The audit below preserves the reviewed source and original recommendation. Its
four-column facts, proposal/approval status and source-state labels such as “current”
refer to that snapshot; the implementation above supersedes them. Changed-module
links identify the module rather than retaining obsolete source-line ranges.

**Reviewed:** 2026-10-22 against current uncommitted source, with independent lifecycle and column-design reviewers. This finding covers exactly AANR's physical occurrence. The earlier [SANR finding](service-agent-node-repo-agent-wakes.md) supplies related reasoning; the Aggregate paths are checked independently here.

**Verdict: retain durable attempt identity; simplify to `attemptedAgentWakes(behaviorKey, resourceId)`.** Row presence records a frozen automatic attempt while that pair remains selected. Derive current deadlines from selected resources and the exact applied behavior. The current four-column lifecycle is sound, but AANR has no additional requirement to persist deadline copies or unattempted rows. No supported-path defect was found.

**Status:** Recommendation only, unapproved and unimplemented. The existing four-column schema remains unchanged. [Plan 151](../../plans/151-plan-storage-table-review.md) keeps source-review completion distinct from implementation and verification.

## Physical owner and represented fact

AggregateAgentNodeRepo is an unversioned MigratableDO identified by `(systemId, aggregateName, aggregateId, agentName)`. One current `agentWakes` row represents one selected resource under one named scheduled behavior: its latest derived deadline and whether AANR has frozen that pair's one automatic command. Query-only behaviors create no rows. This is current scheduling/attempt responsibility, not retained attempt history, command admission, execution or an `outcome`.

The physical Aggregate instance separates these rows from other instances' identical behavior/resource pairs. Repeating `aggregateId`, Aggregate/Agent names or System identity in each row adds no fact. `materializationHead` binds the selected set to its applied Aggregate release; each behavior binds one canonical Model. The row needs neither a Model-name copy nor an Aggregate version, producer identity, generation, command ID or execution-progress field.

- [Physical instance key](https://github.com/morgs32/zerospin/blob/8c8902ad35e81b33887d7fdad3d625da7f326ef2/packages/system-worker/src/AggregateAgentNodeRepo/aggregateAgentNodeRepoMigratableDORepoConfig.ts#L9-L23), [AANR composition](../../../packages/system-worker/src/AggregateAgentNodeRepo/aggregateAgentNodeRepoDbConfig.ts#L6-L8), [shared composition and complete declaration](../../../packages/system-worker/src/agentNodeRepo/agentNodeRepoDbConfig.ts#L7-L9), [all wake fields](../../../packages/core/src/agentBehavior/agentBehaviorDbConfig.ts).
- [Behavior/Model binding](../../../packages/core/src/agent/makeAgentBehavior.ts#L82-L89), [one behavior query per Model](../../../packages/core/src/agent/compileAgentBehaviors.ts#L76-L98).

## Every current column

There are four columns without defaults: required TEXT `behaviorKey`/`resourceId`, nullable INTEGER `wakeAt` and required INTEGER-backed boolean `attempted`. There is one unique `(behaviorKey, resourceId)` index, no declared primary key or foreign key, and no synthesized ID/timestamp. The boolean codec provides runtime meaning; SQL has no explicit boolean-value CHECK. Current readers scan rows; no additional index is justified.

| Field         | Current purpose, null rule, mutability and consumers                                                                                                                                                                                                                                        | Challenge and disposition                                                                                                                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `behaviorKey` | Required authored behavior record key. Reconciliation matches prior attempts by this key and resource ID; the declaration supplies Model, deadline and command callbacks. Removing/renaming a behavior changes which marker matches.                                                        | Cannot derive the durable behavior identity from the physical Agent name or resource alone. Retain in sparse marker identity.                                                                                                 |
| `resourceId`  | Required source resource ID within the behavior's Model. Reconciliation copies `resource.id`; each resource has independent attempt responsibility. Selection exit removes the pair.                                                                                                        | `aggregateId` identifies the owner instance, not this resource. Retain. An FK on resource ID alone would not express the mixed-Model selected table; synchronous reconciliation owns pruning.                                 |
| `wakeAt`      | Latest absolute millisecond deadline from `behavior.getWakeAt(resource)`, refreshed during reconciliation. Null means no current deadline, not selection exit or attempted status. The scheduling reader uses only unattempted non-null values.                                             | Derivable from complete durable selected contents and the exact applied behavior. Remove the cache and derive the minimum for the existing registry interface. A changed or null deadline must not clear an attempt marker.   |
| `attempted`   | Required decoded boolean, explicitly initialized false by reconciliation rather than a SQL default. It becomes true when due input is generated and the outer transaction freezes complete delivery. Matching selected pairs preserve true across later reconciliation and pin replacement. | Its **fact** is indispensable after delivery deletion, but its column and false rows are not: marker presence records true, absence records no attempt for a selected pair. Preserve that fact without a constant true field. |

The sole writer reads prior rows, derives deadlines, preserves matching attempts and replaces the table synchronously. The sole scheduling reader chooses the minimum non-null deadline on unattempted rows. Deadline/false-row removal therefore requires coordinated reader and reconciliation changes, not a declaration-only edit.

- [SQL types/nullability](../../../packages/shapes/src/primitiveMaps.ts#L110-L151), [current writer and deadline derivation](../../../packages/core/src/agentBehavior/reconcileAgentBehaviorsTx.ts), [current next-deadline reader](../../../packages/core/src/agentBehavior/reconcileAgentBehaviorsTx.ts).

## Aggregate lifecycle and transaction boundaries

1. **Bound baseline:** AANR requests its exact AggregateAgentVersionRepo under instance, owner release and Agent identity. Snapshot capture validates instance/Agent/session, reads resources/checkpoint together and publishes the captured position. Exact public checkpoint lookup enforces the requested `aggregateIndex`; snapshot capture compares its hash. No private Agent completion state is needed.
2. **Page/baseline validation:** AANR fences the complete source tuple, including Aggregate instance and release. Selected-page and baseline transactions reconcile wakes alongside selected resources and head. That reconciliation validates exact scheduled Model attributes and nullable safe-integer deadlines before commit/acknowledgement. A sparse implementation must retain that boundary rather than defer validation into an alarm reader.
3. **Due freezing:** The Agent pass requires the matching installed pin, catches up public selection and rereads local resources. Due reconciliation requires non-null `wakeAt <= now` and no previous attempt, then validates the payload. The attempt and complete Aggregate invocation (`id`, `commandName`, `contractVersion`, encoded `payload`, `aggregateVersion`) commit in one synchronous transaction. Model/deadline/payload validation, encoding or insertion failure rolls both back.
4. **Independent delivery:** AANR reconstructs complete admission input from the frozen row and immutable instance/Agent key. Only an exact receipt with a positive safe canonical admission index permits delivery-row deletion. It never clears the attempt or authorizes another command after a retained Failure. An empty outbox cannot substitute for attempt memory.
5. **Selection/null/reconstruction:** Null or changed deadlines preserve the attempt. Same-pin reconstruction retains current selected state and markers. Selection exit removes current responsibility while complete frozen commands remain deliverable. The guarantee is one attempt while continuously selected; exit removes that memory, and no general recurrence/re-entry guarantee is introduced.
6. **Pin replacement:** Pending delivery obstructs replacement before mutation; old-pin delivery must drain first. New baseline, head and marker reconciliation commit together, preserving matching behavior/resource attempts. The complete source fence rejects previous-source pages. No additional generation or per-marker owner version is required.

- [AANR bound source/snapshot request](../../../packages/system-worker/src/AggregateAgentNodeRepo/AggregateAgentNodeRepo.ts#L71-L107), [snapshot validation](../../../packages/system-worker/src/aggregateProjection/getSnapshot/getSnapshot.ts#L36-L70), [synchronous capture](../../../packages/system-worker/src/aggregateProjection/getSnapshot/captureProjectionSnapshotTx.ts#L10-L45), [captured publication/hash comparison](../../../packages/system-worker/src/aggregateProjection/getSnapshot/getSnapshot.ts#L87-L110), [exact checkpoint lookup](../../../packages/system-worker/src/aggregateSessionChain/getCheckpoint.ts#L18-L42).
- [Source-instance fence](../../../packages/system-worker/src/AggregateAgentNodeRepo/AggregateAgentNodeRepo.ts#L180-L203), [page transaction](../../../packages/system-worker/src/agentNodeRepo/makeAgentNodeRuntime.ts), [Model/deadline/payload boundary](../../../packages/core/src/agent/makeAgentBehavior.ts#L121-L168), [attempt and complete input](../../../packages/system-worker/src/agentNodeRepo/makeAgentNodeRuntime.ts), [rollback](../../../packages/core/src/drizzle/make/makeTx.ts#L70-L120).
- [Independent pending delivery and due pass](../../../packages/system-worker/src/agentNodeRepo/makeAgentNodeRuntime.ts), [exact Aggregate admission receipt](../../../packages/system-worker/src/AggregateAgentNodeRepo/AggregateAgentNodeRepo.ts#L122-L156), [baseline/pending-pin guard](../../../packages/system-worker/src/agentNodeRepo/makeAgentNodeRuntime.ts).

## Proposed sparse model and required coordination

```text
attemptedAgentWakes
  behaviorKey TEXT NOT NULL
  resourceId  TEXT NOT NULL
  UNIQUE (behaviorKey, resourceId)
```

Keep only attempted pairs. Presence means a complete automatic invocation was frozen while the pair remains selected; it does not prove admission or execution. Preserve markers through null/deadline changes and matching rebinding. Prune them only when the selected/scheduled pair disappears, independently of frozen delivery. This is a current marker set, not an attempt log, and replaces the old table rather than retaining an alias.

Derive scheduling from a coherent synchronous observation of installed head, selected resources and markers. Check desired/applied Aggregate pin **before** invoking current-definition callbacks. Use the matching local definition and resources; no remote resource query, historical-definition registry, new durable deadline table or replacement generation is needed. Keep exact Model/deadline validation inside baseline/page transactions and marker/input insertion inside the due transaction.

Derivation adds decoding and callback work to scheduling reads. Callbacks are arbitrary functions and purity is not enforced; this recommendation covers the agreed row-derived absolute-deadline behavior, without promising stateful/relative-time selector semantics. Current due processing already reevaluates selectors. SQL-only next-deadline reading is convenience, not another durable fact.

The existing registry interface can remain, but failure handling needs deliberate coordination:

- The runtime independently schedules pending delivery at one second even when selection is empty, every deadline is null or every pair is attempted. Derived scheduling failure must not prevent settlement of already frozen delivery.
- `WakeRegistry.run()` protects dispatch before callbacks and its final readers. Ordinary `reconcile()` invokes readers before writing any alarm and has no such initial protection. New authored-reader failures need explicit retry preservation there as well.
- Ordinary reconciliation currently preserves an already-earlier future alarm. Simply arming a provisional one-second watchdog and then using unchanged `reconcile(false)` would retain that provisional alarm and add unnecessary early passes. Successful reconciliation must replace provisional protection with the legitimate scheduling requirement while retaining the intended earlier-alarm behavior; failure must leave retry protection.
- Due processing still rechecks selection and time, and failed overdue dispatch retries after one second. Preserve these behaviors without immediate failed-overdue loops, completion polling or a second RecoveryRegistry.

Coordinate the shared schema/reconciler, SANR/AANR runtime, existing System Harness caller, declaration reservations, documentation and existing representation assertions. Both physical wake reviews now support this direction, but neither approves implementation. A fixed-schema cutover requires empty affected storage; keep no aliases, fallback decoders or translation migrations, and do not reset existing storage without authorization.

- [AANR explicit registry construction](../../../packages/system-worker/src/AggregateAgentNodeRepo/AggregateAgentNodeRepo.ts#L68-L88), [alarm/activation hooks](../../../packages/system-worker/src/AggregateAgentNodeRepo/AggregateAgentNodeRepo.ts#L162-L169), [pending-only retry reader](../../../packages/system-worker/src/agentNodeRepo/makeAgentNodeRuntime.ts).
- [Ordinary reconciliation and earlier-alarm retention](../../../packages/system-worker/src/makeWakeRegistry/makeWakeRegistry.ts), [dispatch protection and failed-pass reconciliation](../../../packages/system-worker/src/makeWakeRegistry/makeWakeRegistry.ts), [shared Harness caller](../../../packages/core/src/testing/systemHarness/reconcileHarnessAgents.ts#L20-L35).

## Reconciliation, verification limits and next work

Both independent reviewers support the sparse proposal after checking actual Aggregate source binding, pre-acknowledgement validation, transaction rollback, null/deadline changes, selection exit, reconstruction, exact admission, pin replacement and alarm failure paths. No Aggregate-specific durable field beyond attempted behavior/resource identity was established. The four-column implementation remains correct at the reviewed seams; the recommendation removes redundant state rather than repairing demonstrated corruption.

Earlier [Plan 249](../../archive/plans/249-plan-aggregate-agent-backend-node.md), the [five-field AANR outbox follow-up](aggregate-agent-node-repo-command-delivery-outbox.md#approved-implementation-follow-up) and the retired `agent-runtime.spec.ts`/`wake-registry.spec.ts` cases recorded historical evidence for the four-column representation. Current direct cases live in [agent-node-aggregate.workerd.spec.ts](../../../packages/system-worker/tests/workerd/agent-node-aggregate.workerd.spec.ts) and [alarm-registries.workerd.spec.ts](../../../packages/system-worker/tests/workerd/alarm-registries.workerd.spec.ts); [Plan 257](../../archive/plans/257-plan-direct-system-worker-verifications.md) tracks their migration. No checks were rerun for this review and its historical evidence does not prove the proposed sparse representation. A future approved cutover needs verification of coherent derived reads, ordinary reconciliation reader failures/watchdog replacement, pre-acknowledgement validation, marker/input rollback, deadlines, pending-only retry and marker preservation/pruning.

Only this finding and Plan 151 change. Local links/source-range bounds, queue markers, bounded source preservation and whitespace were checked. Production source/schema and existing storage stayed unchanged. No runtime/type/lint/test/build checks, tests, fixtures, reset, publication or deployment ran.

**Next work:** Return to Plan 151's queued command-operation durable delivery verification. All eight SANR/AANR domain-table occurrences now have separate findings; migration-ledger reviews and other owners remain independent. Both sparse-marker recommendations remain unapproved/unimplemented. Parent Plan 151 stays active.
